/**
 * Worker de notificaciones de liga (bienvenida + verificación).
 *
 * Con LIGA_NOTIFICACIONES_ENVIOS_REALES !== "true": no lee cola, no escribe,
 * no llama a Resend (seguro por defecto).
 *
 * Con el flag exacto "true": reclama pendientes, valida preferencias otra vez,
 * envía vía Resend con Idempotency-Key y registra aceptación/omisión/error.
 * Independiente de Torneo Express / notificaciones_eventos_queue.
 */
import {
  createCredentialClient,
  logCredentialSelection,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";
import {
  logResendConfig,
  resendApiKeyConfigured,
  sendByResend,
} from "../_shared/resendEmail.ts";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  isFakeOrInvalidEmail,
  renderBienvenidaWorker,
  renderVerificacionWorker,
} from "../_shared/ligaNotificacionesMail.ts";

const MODULE = "procesar-liga-notificaciones";
const SECRET_HEADER = "x-liga-notificaciones-secret";
const MAX_BATCH = 20;
const MAX_ATTEMPTS = 3;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QueueRow = {
  id: string;
  liga_id: string;
  liga_jugador_id: string;
  idempotency_key: string;
  estado: string;
  attempts: number;
  tipo: string;
};

type PrefRow = {
  admin_habilitado: boolean;
  consentimiento_estado: string;
  consentimiento_origen: string | null;
  consentimiento_registrado_at: string | null;
  correo_verificado: boolean;
  correo_verificacion_origen: string | null;
  correo_verificado_email: string | null;
};

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function publicBase(): string {
  const raw = (Deno.env.get("PUBLIC_APP_URL") ?? "https://appriviera.rivieraopen.com")
    .trim()
    .replace(/\/+$/, "");
  return raw || "https://appriviera.rivieraopen.com";
}

function classifyResendFailure(status: number): "temporal" | "permanente" {
  if (status === 429 || status >= 500 || status === 0) return "temporal";
  return "permanente";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "metodo_no_permitido" });
  }

  const expected = Deno.env.get("LIGA_NOTIFICACIONES_WEBHOOK_SECRET") ?? "";
  const received = req.headers.get(SECRET_HEADER) ?? "";
  if (!expected || received !== expected) {
    return json(req, 401, { ok: false, error: "no_autorizado" });
  }

  const reales = Deno.env.get("LIGA_NOTIFICACIONES_ENVIOS_REALES") === "true";
  if (!reales) {
    return json(req, 200, {
      ok: true,
      enviosReales: false,
      procesados: 0,
      escritos: 0,
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  if (!SUPABASE_URL) {
    return json(req, 500, { ok: false, error: "supabase_url_ausente" });
  }
  if (!resendApiKeyConfigured()) {
    return json(req, 503, { ok: false, error: "resend_no_configurado" });
  }

  const secretKey = readSecretCredential();
  logCredentialSelection({ module: MODULE, secret: secretKey });
  logResendConfig(MODULE);
  const supabase = createCredentialClient(SUPABASE_URL, secretKey);

  let procesados = 0;
  let escritos = 0;
  let aceptados = 0;
  let omitidos = 0;
  let errores = 0;

  // ---- Bienvenida ----
  const { data: pendientes, error: listErr } = await supabase
    .from("liga_notificaciones_queue")
    .select("id, liga_id, liga_jugador_id, idempotency_key, estado, attempts, tipo")
    .eq("estado", "pendiente")
    .eq("tipo", "bienvenida")
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (listErr) {
    return json(req, 500, { ok: false, error: "cola_no_disponible" });
  }

  for (const raw of pendientes ?? []) {
    const row = raw as QueueRow;
    procesados += 1;

    const nextAttempts = Number(row.attempts ?? 0) + 1;
    const { data: claimed, error: claimErr } = await supabase
      .from("liga_notificaciones_queue")
      .update({
        estado: "procesando",
        attempts: nextAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("estado", "pendiente")
      .select("id, liga_id, liga_jugador_id, idempotency_key, attempts")
      .maybeSingle();

    if (claimErr || !claimed) continue;
    escritos += 1;

    const outcome = await procesarBienvenida(supabase, {
      id: claimed.id as string,
      liga_id: claimed.liga_id as string,
      liga_jugador_id: claimed.liga_jugador_id as string,
      idempotency_key: claimed.idempotency_key as string,
      attempts: Number(claimed.attempts ?? nextAttempts),
    });

    if (outcome === "aceptado") aceptados += 1;
    else if (outcome === "omitido") omitidos += 1;
    else errores += 1;
  }

  // ---- Verificación ----
  const { data: verificaciones } = await supabase
    .from("liga_notificaciones_verificacion_envio")
    .select("solicitud_id, liga_id, email_normalizado, token_claro, idempotency_key")
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  for (const item of verificaciones ?? []) {
    procesados += 1;
    const result = await procesarVerificacion(supabase, {
      solicitud_id: String(item.solicitud_id),
      liga_id: String(item.liga_id),
      email_normalizado: String(item.email_normalizado),
      token_claro: String(item.token_claro),
      idempotency_key: String(item.idempotency_key),
    });
    if (result.escrito) escritos += 1;
    if (result.kind === "aceptado") aceptados += 1;
    else if (result.kind === "omitido") omitidos += 1;
    else errores += 1;
  }

  return json(req, 200, {
    ok: true,
    enviosReales: true,
    procesados,
    escritos,
    aceptados,
    omitidos,
    errores,
  });
});

async function procesarBienvenida(
  supabase: ReturnType<typeof createCredentialClient>,
  row: {
    id: string;
    liga_id: string;
    liga_jugador_id: string;
    idempotency_key: string;
    attempts: number;
  },
): Promise<"aceptado" | "omitido" | "error"> {
  const { data: config } = await supabase
    .from("liga_notificaciones_config")
    .select("bienvenida_pausada")
    .eq("liga_id", row.liga_id)
    .maybeSingle();

  if (config?.bienvenida_pausada !== false) {
    await finalizarBienvenida(supabase, row, {
      estado: "pausado",
      motivo: "liga_pausada",
      proveedor: null,
    });
    return "omitido";
  }

  const { data: pref } = await supabase
    .from("liga_notificaciones_preferencias")
    .select(
      "admin_habilitado, consentimiento_estado, consentimiento_origen, consentimiento_registrado_at, correo_verificado, correo_verificacion_origen, correo_verificado_email",
    )
    .eq("liga_id", row.liga_id)
    .eq("liga_jugador_id", row.liga_jugador_id)
    .maybeSingle();

  const preferencia = pref as PrefRow | null;
  if (!preferencia?.admin_habilitado) {
    await finalizarBienvenida(supabase, row, {
      estado: "pausado",
      motivo: "deshabilitado",
      proveedor: null,
    });
    return "omitido";
  }
  if (
    preferencia.consentimiento_estado !== "autorizado" ||
    !preferencia.consentimiento_origen ||
    !preferencia.consentimiento_registrado_at
  ) {
    await finalizarBienvenida(supabase, row, {
      estado: "omitido",
      motivo: "sin_autorizacion",
      proveedor: null,
    });
    return "omitido";
  }
  if (
    !preferencia.correo_verificado ||
    preferencia.correo_verificacion_origen !== "enlace_de_confirmacion"
  ) {
    await finalizarBienvenida(supabase, row, {
      estado: "omitido",
      motivo: "correo_por_verificar",
      proveedor: null,
    });
    return "omitido";
  }

  const { data: jugador } = await supabase
    .from("liga_jugadores")
    .select("nombre, email")
    .eq("id", row.liga_jugador_id)
    .maybeSingle();

  let email = (jugador?.email as string | null) ?? null;
  let nombre = (jugador?.nombre as string | null) ?? "Jugador";
  let rivieraId: string | null = null;

  const { data: riviera } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, email")
    .eq("legacy_liga_jugador_id", row.liga_jugador_id)
    .neq("estado", "archivado")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (riviera) {
    rivieraId = String(riviera.id);
    if (!email) email = (riviera.email as string | null) ?? null;
    if (riviera.nombre) nombre = String(riviera.nombre);
  }

  if (isFakeOrInvalidEmail(email)) {
    await finalizarBienvenida(supabase, row, {
      estado: "omitido",
      motivo: "correo_invalido",
      proveedor: null,
    });
    return "omitido";
  }

  const emailNorm = email!.trim().toLowerCase();
  if (
    preferencia.correo_verificado_email &&
    preferencia.correo_verificado_email !== emailNorm
  ) {
    await finalizarBienvenida(supabase, row, {
      estado: "omitido",
      motivo: "correo_por_verificar",
      proveedor: null,
    });
    return "omitido";
  }

  const { data: liga } = await supabase
    .from("ligas")
    .select("nombre")
    .eq("id", row.liga_id)
    .maybeSingle();

  const base = publicBase();
  const perfilUrl = rivieraId && UUID.test(rivieraId)
    ? `${base}/players/${rivieraId}`
    : `${base}/public/liga/${row.liga_id}`;
  const mail = renderBienvenidaWorker({
    clubNombre: "Riviera Open",
    ligaNombre: String(liga?.nombre ?? "tu liga"),
    jugadorNombre: nombre,
    perfilUrl,
    ligaUrl: `${base}/public/liga/${row.liga_id}`,
  });

  const send = await sendByResend(
    emailNorm,
    mail.asunto,
    mail.text,
    mail.html,
    { function: MODULE, tipo: "bienvenida", queue_id: row.id },
    row.idempotency_key,
  );

  if (send.ok) {
    await finalizarBienvenida(supabase, row, {
      estado: "enviado",
      motivo: null,
      proveedor: "aceptado",
    });
    return "aceptado";
  }

  const clase = classifyResendFailure(send.status);
  if (clase === "temporal" && row.attempts < MAX_ATTEMPTS) {
    await supabase
      .from("liga_notificaciones_queue")
      .update({
        estado: "pendiente",
        motivo: "error_temporal",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await supabase.from("liga_notificaciones_log").insert({
      liga_id: row.liga_id,
      liga_jugador_id: row.liga_jugador_id,
      queue_id: row.id,
      tipo: "bienvenida",
      estado: "pendiente",
      attempts: row.attempts,
      motivo: "error_temporal",
      proveedor_estado: null,
    });
    return "error";
  }

  await finalizarBienvenida(supabase, row, {
    estado: "error",
    motivo: clase === "temporal" ? "error_temporal" : "error_permanente",
    proveedor: null,
  });
  return "error";
}

async function finalizarBienvenida(
  supabase: ReturnType<typeof createCredentialClient>,
  row: { id: string; liga_id: string; liga_jugador_id: string; attempts: number },
  result: {
    estado: string;
    motivo: string | null;
    proveedor: "aceptado" | "entregado" | null;
  },
) {
  await supabase
    .from("liga_notificaciones_queue")
    .update({
      estado: result.estado,
      motivo: result.motivo,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  await supabase.from("liga_notificaciones_log").insert({
    liga_id: row.liga_id,
    liga_jugador_id: row.liga_jugador_id,
    queue_id: row.id,
    tipo: "bienvenida",
    estado: result.estado,
    attempts: row.attempts,
    motivo: result.motivo,
    proveedor_estado: result.proveedor,
  });
}

async function procesarVerificacion(
  supabase: ReturnType<typeof createCredentialClient>,
  item: {
    solicitud_id: string;
    liga_id: string;
    email_normalizado: string;
    token_claro: string;
    idempotency_key: string;
  },
): Promise<{ escrito: boolean; kind: "aceptado" | "omitido" | "error" }> {
  if (isFakeOrInvalidEmail(item.email_normalizado)) {
    await supabase
      .from("liga_notificaciones_verificacion_outbox")
      .update({ estado: "omitido" })
      .eq("solicitud_id", item.solicitud_id)
      .eq("estado", "pendiente");
    await supabase
      .from("liga_notificaciones_verificacion_envio")
      .delete()
      .eq("solicitud_id", item.solicitud_id);
    return { escrito: true, kind: "omitido" };
  }

  const { data: solicitud } = await supabase
    .from("liga_notificaciones_verificaciones")
    .select("liga_jugador_id, estado, expires_at")
    .eq("id", item.solicitud_id)
    .maybeSingle();

  if (!solicitud || solicitud.estado !== "pendiente") {
    await supabase
      .from("liga_notificaciones_verificacion_envio")
      .delete()
      .eq("solicitud_id", item.solicitud_id);
    return { escrito: true, kind: "omitido" };
  }

  if (Date.parse(String(solicitud.expires_at)) <= Date.now()) {
    await supabase
      .from("liga_notificaciones_verificacion_outbox")
      .update({ estado: "omitido" })
      .eq("solicitud_id", item.solicitud_id);
    await supabase
      .from("liga_notificaciones_verificacion_envio")
      .delete()
      .eq("solicitud_id", item.solicitud_id);
    return { escrito: true, kind: "omitido" };
  }

  const { data: liga } = await supabase
    .from("ligas")
    .select("nombre")
    .eq("id", item.liga_id)
    .maybeSingle();
  const { data: jugador } = await supabase
    .from("liga_jugadores")
    .select("nombre")
    .eq("id", solicitud.liga_jugador_id)
    .maybeSingle();

  const mail = renderVerificacionWorker({
    clubNombre: "Riviera Open",
    ligaNombre: String(liga?.nombre ?? "tu liga"),
    jugadorNombre: (jugador?.nombre as string | null) ?? null,
    verificarUrl: `${publicBase()}/public/verificar-correo?t=${item.token_claro}`,
  });

  const send = await sendByResend(
    item.email_normalizado,
    mail.asunto,
    mail.text,
    mail.html,
    { function: MODULE, tipo: "verificacion", solicitud_id: item.solicitud_id },
    item.idempotency_key,
  );

  if (send.ok) {
    await supabase
      .from("liga_notificaciones_verificacion_outbox")
      .update({ estado: "enviado" })
      .eq("solicitud_id", item.solicitud_id);
    await supabase.from("liga_notificaciones_log").insert({
      liga_id: item.liga_id,
      liga_jugador_id: solicitud.liga_jugador_id,
      tipo: "verificacion",
      estado: "enviado",
      attempts: 1,
      motivo: null,
      proveedor_estado: "aceptado",
    });
    await supabase
      .from("liga_notificaciones_verificacion_envio")
      .delete()
      .eq("solicitud_id", item.solicitud_id);
    return { escrito: true, kind: "aceptado" };
  }

  await supabase
    .from("liga_notificaciones_verificacion_outbox")
    .update({ estado: "error" })
    .eq("solicitud_id", item.solicitud_id);
  await supabase.from("liga_notificaciones_log").insert({
    liga_id: item.liga_id,
    liga_jugador_id: solicitud.liga_jugador_id,
    tipo: "verificacion",
    estado: "error",
    attempts: 1,
    motivo: "error_permanente",
    proveedor_estado: null,
  });
  // Conserva el token para reintento manual del worker en el próximo tick si es temporal.
  if (classifyResendFailure(send.status) === "permanente") {
    await supabase
      .from("liga_notificaciones_verificacion_envio")
      .delete()
      .eq("solicitud_id", item.solicitud_id);
  }
  return { escrito: true, kind: "error" };
}
