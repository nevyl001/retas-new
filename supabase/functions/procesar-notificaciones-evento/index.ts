/**
 * Cola automática — tipos activos:
 * - bienvenida_torneo (inscripción al torneo, sin grupo)
 * - asignacion_grupo (grupo y rivales asignados)
 * - clasifico_eliminatoria_batch (clasificó / no clasificó)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  companeroFromPair,
  fetchGrupoContextForPair,
} from "../_shared/emailContext.ts";
import { resolveClasificadosPairIds } from "../_shared/clasificadosPairs.ts";
import {
  buildRivieraEmail,
  type RivieraEmailKind,
  type RivieraEmailResult,
} from "../_shared/emailTemplates.ts";
import { notifAlreadySentForPair } from "../_shared/notifDedup.ts";
import { logResendConfig, sendByResend } from "../_shared/resendEmail.ts";

type ActiveQueueEventType =
  | "bienvenida_torneo"
  | "asignacion_grupo"
  | "clasifico_eliminatoria_batch";

type LogTipo =
  | "bienvenida_torneo"
  | "asignacion_grupo"
  | "clasifico_eliminatoria"
  | "no_clasifico";

/** Eventos de cola obsoletos (triggers desactivados en Supabase). */
const LEGACY_QUEUE_EVENTS = new Set([
  "inscripcion_torneo",
  "resultado_partido",
  "partido_programado",
]);

interface QueueRow {
  id: string;
  torneo_express_id: string;
  event_type: string;
  ref_table: string;
  ref_id: string | null;
  pair_id: string | null;
  payload: Record<string, unknown> | null;
  estado: "pendiente" | "procesando" | "procesado" | "error" | "omitido";
  attempts: number;
}

interface PairWithContactRow {
  pair_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player1_email: string | null;
  player1_email_verified: boolean | null;
  player1_opt_email: boolean | null;
  player2_name: string;
  player2_email: string | null;
  player2_email_verified: boolean | null;
  player2_opt_email: boolean | null;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-notificaciones-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOTIFICACIONES_WEBHOOK_SECRET =
  Deno.env.get("NOTIFICACIONES_WEBHOOK_SECRET") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

if (!NOTIFICACIONES_WEBHOOK_SECRET) {
  throw new Error("Missing NOTIFICACIONES_WEBHOOK_SECRET env var.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

logResendConfig("procesar-notificaciones-evento");

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Comparación en tiempo constante para evitar filtrar el secret por timing. */
function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isAuthorizedWebhook(req: Request): boolean {
  const provided = req.headers.get("x-notificaciones-secret")?.trim() ?? "";
  if (!provided) return false;
  return secretsEqual(provided, NOTIFICACIONES_WEBHOOK_SECRET);
}

function isFakeEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.toLowerCase().endsWith("@padel.local");
}

function emailEligible(player: {
  email: string | null;
  emailVerified: boolean;
  optInEmail: boolean;
}): boolean {
  return Boolean(
    player.email &&
      !isFakeEmail(player.email) &&
      player.emailVerified !== false &&
      player.optInEmail,
  );
}

function logTipoForEvent(
  eventType: ActiveQueueEventType,
  clasificado: boolean,
): LogTipo {
  if (eventType === "bienvenida_torneo") return "bienvenida_torneo";
  if (eventType === "clasifico_eliminatoria_batch") {
    return clasificado ? "clasifico_eliminatoria" : "no_clasifico";
  }
  return "asignacion_grupo";
}

async function logNotif(input: {
  torneoId: string;
  playerId: string;
  pairId: string;
  canal: "email";
  tipo: LogTipo;
  destinatario: string;
  message: string;
  estado: "enviado" | "error" | "sin_contacto";
  errorDetalle?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("notificaciones_log").insert({
    torneo_express_id: input.torneoId,
    player_id: input.playerId,
    pair_id: input.pairId,
    canal: input.canal,
    tipo: input.tipo,
    destinatario: input.destinatario,
    mensaje_preview: input.message.slice(0, 240),
    estado: input.estado,
    error_detalle: input.errorDetalle ?? null,
    metadata: input.metadata ?? {},
    sent_at: input.estado === "enviado" ? new Date().toISOString() : null,
  });
}

async function markQueue(
  id: string,
  patch: Partial<Pick<QueueRow, "estado" | "error_detalle">> & {
    processed_at?: string | null;
    attemptsInc?: boolean;
  },
) {
  const updatePayload: Record<string, unknown> = {};
  if (patch.estado) updatePayload.estado = patch.estado;
  if ("error_detalle" in patch) updatePayload.error_detalle = patch.error_detalle;
  if ("processed_at" in patch) updatePayload.processed_at = patch.processed_at;
  if (patch.attemptsInc) {
    const { data: current } = await supabase
      .from("notificaciones_eventos_queue")
      .select("attempts")
      .eq("id", id)
      .single();
    updatePayload.attempts = ((current?.attempts as number | undefined) ?? 0) + 1;
  }

  await supabase
    .from("notificaciones_eventos_queue")
    .update(updatePayload)
    .eq("id", id);
}

async function fetchPairsWithContacts(
  pairIds: string[],
): Promise<PairWithContactRow[]> {
  if (!pairIds.length) return [];
  const { data, error } = await supabase
    .from("pairs_with_contact")
    .select("*")
    .in("pair_id", pairIds);
  if (error) throw error;
  return (data ?? []) as PairWithContactRow[];
}

async function buildQueuePlayerEmail(input: {
  logTipo: LogTipo;
  playerName: string;
  playerId: string;
  torneoId: string;
  torneoNombre: string;
  categoria: string | null;
  pair: PairWithContactRow;
  grupoId?: string | null;
  grupoNombre?: string | null;
  rivalesGrupo?: string | null;
}): Promise<RivieraEmailResult> {
  const isBienvenida = input.logTipo === "bienvenida_torneo";
  const compañero = isBienvenida
    ? null
    : companeroFromPair(input.pair, input.playerId);
  const kind: RivieraEmailKind = input.logTipo;

  return buildRivieraEmail({
    kind,
    playerName: input.playerName,
    torneoNombre: input.torneoNombre,
    torneoId: input.torneoId,
    categoria: input.categoria,
    compañero: compañero ?? undefined,
    grupoId: isBienvenida ? null : input.grupoId,
    grupoNombre: isBienvenida ? null : input.grupoNombre,
    rivales: isBienvenida ? null : input.rivalesGrupo,
  });
}

async function runQueueEvent(queue: QueueRow) {
  if (LEGACY_QUEUE_EVENTS.has(queue.event_type)) {
    return;
  }

  const eventType = queue.event_type as ActiveQueueEventType;
  if (
    eventType !== "bienvenida_torneo" &&
    eventType !== "asignacion_grupo" &&
    eventType !== "clasifico_eliminatoria_batch"
  ) {
    return;
  }

  const { data: torneo, error: torneoErr } = await supabase
    .from("torneo_express")
    .select("id, nombre, categoria, created_at")
    .eq("id", queue.torneo_express_id)
    .single();
  if (torneoErr || !torneo) throw new Error("Torneo no encontrado.");

  const torneoNombre = torneo.nombre as string;
  const categoria = (torneo.categoria as string | null) ?? null;

  let targetPairIds: string[] = [];
  let groupName: string | null = null;

  if (eventType === "asignacion_grupo" || eventType === "bienvenida_torneo") {
    if (queue.pair_id) targetPairIds = [queue.pair_id];
    groupName = (queue.payload?.grupo_nombre as string | undefined) ?? null;
  } else {
    const { data: grupos, error: gruposErr } = await supabase
      .from("torneo_express_grupos")
      .select("id")
      .eq("torneo_id", queue.torneo_express_id);
    if (gruposErr) throw gruposErr;
    const grupoIds = (grupos ?? []).map((g) => g.id as string);
    if (grupoIds.length === 0) return;

    const { data: gp, error: gpErr } = await supabase
      .from("torneo_express_grupo_parejas")
      .select("pareja_id")
      .in("grupo_id", grupoIds);
    if (gpErr) throw gpErr;
    targetPairIds = Array.from(
      new Set((gp ?? []).map((r) => r.pareja_id as string).filter(Boolean)),
    );
  }

  targetPairIds = Array.from(new Set(targetPairIds));
  if (!targetPairIds.length) return;

  const clasificadosSet =
    eventType === "clasifico_eliminatoria_batch"
      ? await resolveClasificadosPairIds(supabase, queue.torneo_express_id)
      : null;

  const pairs = await fetchPairsWithContacts(targetPairIds);

  for (const pair of pairs) {
    const clasificado = clasificadosSet?.has(pair.pair_id) ?? false;
    const logTipo = logTipoForEvent(eventType, clasificado);
    const isBienvenida = logTipo === "bienvenida_torneo";

    if (
      await notifAlreadySentForPair(
        supabase,
        queue.torneo_express_id,
        pair.pair_id,
        logTipo,
      )
    ) {
      continue;
    }

    const ctx = isBienvenida
      ? { grupoId: null, grupoNombre: null, rivales: null }
      : await fetchGrupoContextForPair(
          supabase,
          queue.torneo_express_id,
          pair.pair_id,
        );
    const grupoId =
      (queue.payload?.grupo_id as string | undefined) ?? ctx.grupoId;
    const grupoNombre = ctx.grupoNombre ?? groupName;
    const rivalesGrupo = ctx.rivales;

    const players = [
      {
        id: pair.player1_id,
        name: pair.player1_name,
        email: pair.player1_email,
        emailVerified: Boolean(pair.player1_email_verified),
        optInEmail: pair.player1_opt_email !== false,
      },
      {
        id: pair.player2_id,
        name: pair.player2_name,
        email: pair.player2_email,
        emailVerified: Boolean(pair.player2_email_verified),
        optInEmail: pair.player2_opt_email !== false,
      },
    ];

    for (const p of players) {
      const mail = await buildQueuePlayerEmail({
        logTipo,
        playerName: p.name,
        playerId: p.id,
        torneoId: queue.torneo_express_id,
        torneoNombre,
        categoria,
        pair,
        grupoId,
        grupoNombre,
        rivalesGrupo,
      });

      const message = mail.text;
      const emailSubject = mail.subject;
      const emailHtml = mail.html;

      const emailOk = emailEligible({
        email: p.email,
        emailVerified: p.emailVerified,
        optInEmail: p.optInEmail,
      });

      if (!emailOk) {
        await logNotif({
          torneoId: queue.torneo_express_id,
          playerId: p.id,
          pairId: pair.pair_id,
          canal: "email",
          tipo: logTipo,
          destinatario: p.email ?? "sin_contacto",
          message,
          estado: "sin_contacto",
          metadata: {
            queue_id: queue.id,
            motivo: "Sin email valido u opt-in de email",
          },
        });
        continue;
      }

      if (emailOk && p.email) {
        const result = await sendByResend(
          p.email,
          emailSubject,
          message,
          emailHtml,
          {
            function: "procesar-notificaciones-evento",
            event_type: eventType,
            queue_id: queue.id,
            player_id: p.id,
            pair_id: pair.pair_id,
          },
        );
        await logNotif({
          torneoId: queue.torneo_express_id,
          playerId: p.id,
          pairId: pair.pair_id,
          canal: "email",
          tipo: logTipo,
          destinatario: p.email,
          message,
          estado: result.ok ? "enviado" : "error",
          errorDetalle: result.error,
          metadata: {
            queue_id: queue.id,
            resend_status: result.status,
            resend_response: result.responseBody.slice(0, 500),
          },
        });
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!isAuthorizedWebhook(req)) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const queueId =
    (body?.record as { id?: string } | undefined)?.id ??
    (body?.id as string | undefined) ??
    (body?.queue_id as string | undefined);
  if (!queueId || typeof queueId !== "string") {
    return jsonResponse(400, { error: "Missing queue event id (record.id)" });
  }

  const { data: queueRowRaw, error: queueErr } = await supabase
    .from("notificaciones_eventos_queue")
    .select("*")
    .eq("id", queueId)
    .single();
  if (queueErr || !queueRowRaw) {
    return jsonResponse(404, { error: "Queue event not found" });
  }
  const queue = queueRowRaw as QueueRow;

  if (queue.estado !== "pendiente") {
    return jsonResponse(200, {
      ok: true,
      skipped: true,
      reason: `estado=${queue.estado}`,
    });
  }

  await markQueue(queue.id, { estado: "procesando", attemptsInc: true });
  try {
    await runQueueEvent(queue);
    await markQueue(queue.id, {
      estado: "procesado",
      error_detalle: null,
      processed_at: new Date().toISOString(),
    });
    return jsonResponse(200, {
      ok: true,
      queue_id: queue.id,
      estado: "procesado",
    });
  } catch (e) {
    const errorDetalle = e instanceof Error ? e.message : "Error desconocido";
    await markQueue(queue.id, {
      estado: "error",
      error_detalle: errorDetalle,
      processed_at: new Date().toISOString(),
    });
    return jsonResponse(500, {
      ok: false,
      queue_id: queue.id,
      error: errorDetalle,
    });
  }
});
