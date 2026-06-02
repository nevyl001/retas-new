import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  companeroFromPair,
  fetchGrupoContextForPair,
} from "../_shared/emailContext.ts";
import {
  buildRivieraEmail,
  type RivieraEmailResult,
} from "../_shared/emailTemplates.ts";
import { resolveClasificadosPairIds } from "../_shared/clasificadosPairs.ts";
import { notifAlreadySentForPair } from "../_shared/notifDedup.ts";
import {
  logResendConfig,
  RESEND_FROM,
  resendApiKeyConfigured,
  sendByResend,
} from "../_shared/resendEmail.ts";

type NotifTipo =
  | "bienvenida_torneo"
  | "asignacion_grupo"
  | "clasifico_eliminatoria"
  | "no_clasifico"
  | "clasifico_final"
  | "no_llego_final";

interface RequestBody {
  torneo_express_id: string;
  tipo: NotifTipo;
  pair_id?: string;
  player_id?: string;
  /** Reenvío manual desde el panel: ignora dedup por pareja+tipo */
  force_resend?: boolean;
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

interface PlayerContact {
  playerId: string;
  playerName: string;
  email: string | null;
  emailVerified: boolean;
  optInEmail: boolean;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

logResendConfig("enviar-notificaciones");

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isFakeEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.toLowerCase().endsWith("@padel.local");
}

async function buildPlayerEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  tipo: NotifTipo,
  torneoId: string,
  torneoNombre: string,
  torneoCategoria: string | null,
  torneoCreatedAt: string | null,
  pair: PairWithContactRow,
  player: PlayerContact,
): Promise<RivieraEmailResult> {
  const compañero = companeroFromPair(pair, player.playerId);
  const grupoCtx = await fetchGrupoContextForPair(
    supabaseAdmin,
    torneoId,
    pair.pair_id,
  );

  const base = {
    playerName: player.playerName,
    torneoNombre,
    torneoId,
    categoria: torneoCategoria,
    compañero,
    grupoId: grupoCtx.grupoId,
    grupoNombre: grupoCtx.grupoNombre,
    rivales: grupoCtx.rivales,
  };

  if (tipo === "bienvenida_torneo") {
    return buildRivieraEmail({
      kind: "bienvenida_torneo",
      playerName: player.playerName,
      torneoNombre,
      torneoId,
      categoria: torneoCategoria,
    });
  }

  if (tipo === "asignacion_grupo") {
    return buildRivieraEmail({
      kind: "asignacion_grupo",
      ...base,
    });
  }

  if (tipo === "clasifico_eliminatoria") {
    return buildRivieraEmail({
      kind: "clasifico_eliminatoria",
      ...base,
    });
  }

  if (tipo === "no_clasifico") {
    return buildRivieraEmail({
      kind: "no_clasifico",
      ...base,
    });
  }

  if (tipo === "clasifico_final") {
    return buildRivieraEmail({
      kind: "clasifico_final",
      ...base,
    });
  }

  if (tipo === "no_llego_final") {
    return buildRivieraEmail({
      kind: "no_llego_final",
      ...base,
    });
  }

  throw new Error(`tipo de email no soportado: ${tipo}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  if (!body?.torneo_express_id || !body?.tipo) {
    return jsonResponse(400, {
      error: "torneo_express_id y tipo son obligatorios",
    });
  }

  const tiposValidos: NotifTipo[] = [
    "bienvenida_torneo",
    "asignacion_grupo",
    "clasifico_eliminatoria",
    "no_clasifico",
    "clasifico_final",
    "no_llego_final",
  ];
  if (!tiposValidos.includes(body.tipo)) {
    return jsonResponse(400, { error: "tipo no soportado" });
  }

  if (!resendApiKeyConfigured()) {
    return jsonResponse(500, {
      error: "RESEND_API_KEY no configurada en producción (Supabase Edge Function secrets).",
      resend_from: RESEND_FROM,
    });
  }

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userError } =
    await supabaseAuthed.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(401, { error: "Token inválido o sesión expirada" });
  }

  const { data: torneo, error: torneoErr } = await supabaseAuthed
    .from("torneo_express")
    .select("id, nombre, categoria, created_at")
    .eq("id", body.torneo_express_id)
    .maybeSingle();

  if (torneoErr || !torneo) {
    return jsonResponse(403, {
      error: "No autorizado para este torneo o torneo inexistente",
    });
  }

  const { data: grupos, error: gruposErr } = await supabaseAdmin
    .from("torneo_express_grupos")
    .select("id")
    .eq("torneo_id", body.torneo_express_id);
  if (gruposErr) {
    return jsonResponse(500, { error: gruposErr.message });
  }

  const grupoIds = (grupos ?? []).map((g) => g.id as string);
  if (grupoIds.length === 0) {
    return jsonResponse(200, {
      enviados_email: 0,
      sin_contacto: 0,
      errores: 0,
      detalle: "Sin grupos/parejas para notificar",
    });
  }

  const { data: gpRows, error: gpErr } = await supabaseAdmin
    .from("torneo_express_grupo_parejas")
    .select("pareja_id")
    .in("grupo_id", grupoIds);
  if (gpErr) return jsonResponse(500, { error: gpErr.message });

  const allPairIds = Array.from(
    new Set((gpRows ?? []).map((r) => r.pareja_id as string).filter(Boolean)),
  );
  if (allPairIds.length === 0) {
    return jsonResponse(200, {
      enviados_email: 0,
      sin_contacto: 0,
      errores: 0,
      detalle: "No hay parejas asociadas",
    });
  }

  let targetPairIds = allPairIds;
  if (
    (body.tipo === "clasifico_final" || body.tipo === "no_llego_final") &&
    body.pair_id
  ) {
    targetPairIds = allPairIds.includes(body.pair_id) ? [body.pair_id] : [];
  } else if (body.tipo === "clasifico_final" || body.tipo === "no_llego_final") {
    targetPairIds = [];
  } else if (
    body.tipo === "clasifico_eliminatoria" ||
    body.tipo === "no_clasifico"
  ) {
    if (body.pair_id && allPairIds.includes(body.pair_id)) {
      targetPairIds = [body.pair_id];
    } else {
      let clasificados: Set<string>;
      try {
        clasificados = await resolveClasificadosPairIds(
          supabaseAdmin,
          body.torneo_express_id,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al resolver clasificados";
        return jsonResponse(500, { error: msg });
      }

      targetPairIds = allPairIds.filter((id) =>
        body.tipo === "clasifico_eliminatoria"
          ? clasificados.has(id)
          : !clasificados.has(id)
      );
    }
  }

  if (targetPairIds.length === 0) {
    return jsonResponse(200, {
      enviados_email: 0,
      sin_contacto: 0,
      errores: 0,
      detalle: "No hay destinatarios para el filtro solicitado",
    });
  }

  const { data: pairContacts, error: pairContactsErr } = await supabaseAdmin
    .from("pairs_with_contact")
    .select("*")
    .in("pair_id", targetPairIds);
  if (pairContactsErr) {
    return jsonResponse(500, { error: pairContactsErr.message });
  }

  let enviadosEmail = 0;
  let sinContacto = 0;
  let errores = 0;
  let omitidosDuplicado = 0;

  const torneoNombre = (torneo as { nombre: string }).nombre;
  const torneoCategoria = (torneo as { categoria: string | null }).categoria ?? null;
  const torneoCreatedAt = (torneo as { created_at?: string }).created_at ?? null;

  for (const pair of (pairContacts ?? []) as PairWithContactRow[]) {
    if (body.pair_id && pair.pair_id !== body.pair_id) {
      continue;
    }

    if (
      !body.force_resend &&
      (await notifAlreadySentForPair(
        supabaseAdmin,
        body.torneo_express_id,
        pair.pair_id,
        body.tipo,
      ))
    ) {
      omitidosDuplicado += 1;
      continue;
    }

    const players: PlayerContact[] = [
      {
        playerId: pair.player1_id,
        playerName: pair.player1_name,
        email: pair.player1_email,
        emailVerified: pair.player1_email_verified !== false,
        optInEmail: pair.player1_opt_email !== false,
      },
      {
        playerId: pair.player2_id,
        playerName: pair.player2_name,
        email: pair.player2_email,
        emailVerified: pair.player2_email_verified !== false,
        optInEmail: pair.player2_opt_email !== false,
      },
    ];

    for (const player of players) {
      if (body.player_id && player.playerId !== body.player_id) {
        continue;
      }

      const emailOk = Boolean(
        player.email &&
          player.optInEmail &&
          player.emailVerified &&
          !isFakeEmail(player.email),
      );

      const mailPreview = await buildPlayerEmail(
        supabaseAdmin,
        body.tipo,
        body.torneo_express_id,
        torneoNombre,
        torneoCategoria,
        torneoCreatedAt,
        pair,
        player,
      );

      if (!emailOk) {
        sinContacto += 1;
        await supabaseAdmin.from("notificaciones_log").insert({
          torneo_express_id: body.torneo_express_id,
          player_id: player.playerId,
          pair_id: pair.pair_id,
          canal: "email",
          tipo: body.tipo,
          destinatario: player.email ?? "sin_contacto",
          mensaje_preview: mailPreview.text.slice(0, 240),
          estado: "sin_contacto",
          metadata: {
            motivo: "Sin email valido u opt-in de email",
            email: player.email,
          },
        });
        continue;
      }

      if (emailOk && player.email) {
        const result = await sendByResend(
          player.email,
          mailPreview.subject,
          mailPreview.text,
          mailPreview.html,
          {
            function: "enviar-notificaciones",
            tipo: body.tipo,
            player_id: player.playerId,
            pair_id: pair.pair_id,
          },
        );
        if (result.ok) {
          enviadosEmail += 1;
        } else {
          errores += 1;
        }
        await supabaseAdmin.from("notificaciones_log").insert({
          torneo_express_id: body.torneo_express_id,
          player_id: player.playerId,
          pair_id: pair.pair_id,
          canal: "email",
          tipo: body.tipo,
          destinatario: player.email,
          mensaje_preview: mailPreview.text.slice(0, 240),
          estado: result.ok ? "enviado" : "error",
          error_detalle: result.error ?? null,
          sent_at: result.ok ? new Date().toISOString() : null,
          metadata: {
            resend_status: result.status,
            resend_response: result.responseBody.slice(0, 500),
          },
        });
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    enviados_email: enviadosEmail,
    sin_contacto: sinContacto,
    errores,
    omitidos_duplicado: omitidosDuplicado,
  });
});
