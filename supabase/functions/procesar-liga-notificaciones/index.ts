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
  extraerUrlPublicaJornadaWorker,
  isFakeOrInvalidEmail,
  recordatorioTieneHorarioOficial,
  renderBienvenidaWorker,
  renderComunicacionWorker,
  resolveLigaMailBrandingWorker,
  type LigaMailBranding,
} from "../_shared/ligaNotificacionesMail.ts";
import {
  construirCorreoSupervision,
  NOMBRE_EJEMPLO_SUPERVISION,
} from "../../../src/lib/liga/notificaciones/supervisionCopiaMail.ts";

const MODULE = "procesar-liga-notificaciones";
const SECRET_HEADER = "x-liga-notificaciones-secret";
const MAX_BATCH = 50;
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
  asunto: string | null;
  cuerpo_texto: string | null;
  lote_id: string | null;
  jornada_id?: string | null;
  jornada_numero?: number | null;
};

type PrefRow = {
  admin_habilitado: boolean;
  consentimiento_estado: string;
  consentimiento_origen: string | null;
  consentimiento_registrado_at: string | null;
};

const TIPOS_LOG = new Set([
  "bienvenida",
  "aviso_general",
  "jornada",
  "cambio_horario",
  "felicitacion",
  "personalizado",
  "resultados_jornada",
  "recordatorio_jornada",
]);

function parseAllowlist(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const value = part.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith("@padel.local")) {
      set.add(value);
    }
  }
  return set;
}

function parseReplyTo(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.endsWith("@padel.local")) {
    return null;
  }
  return value;
}

/** Allowlist antes de reclamar. Sin columnas de 0101. */
function decidirReclamo(input: {
  email: string | null;
  allowlist: Set<string>;
  modoOperativo: boolean;
  pref: PrefRow | null;
}): { reclamar: boolean; motivo: string } {
  const email = input.email?.trim().toLowerCase() ?? "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith("@padel.local");
  if (!emailOk) return { reclamar: false, motivo: "sin_correo" };
  if (!input.modoOperativo && !input.allowlist.has(email)) {
    return { reclamar: false, motivo: "fuera_de_allowlist" };
  }
  if (!input.pref?.admin_habilitado) {
    return { reclamar: false, motivo: "deshabilitado" };
  }
  if (input.pref.consentimiento_estado === "revocado") {
    return { reclamar: false, motivo: "sin_autorizacion" };
  }
  const origen = input.pref.consentimiento_origen?.trim().toLowerCase() ?? "";
  const consentimientoPosterior =
    input.pref.consentimiento_estado === "autorizado" &&
    Boolean(origen) &&
    !["inscripcion", "confirmacion_inscripcion", "tiene_correo", "email"].includes(origen) &&
    Boolean(input.pref.consentimiento_registrado_at);
  if (!consentimientoPosterior) {
    return { reclamar: false, motivo: "sin_autorizacion" };
  }
  return { reclamar: true, motivo: "ok" };
}

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

async function leerPedido(
  req: Request,
): Promise<{ loteId: string | null; programadas: boolean }> {
  try {
    const body = await req.json();
    const raw = typeof body?.lote_id === "string" ? body.lote_id.trim() : "";
    return {
      loteId: UUID.test(raw) ? raw : null,
      programadas: body?.programadas === true,
    };
  } catch {
    return { loteId: null, programadas: false };
  }
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
      enviados: 0,
      escritos: 0,
    });
  }

  const modoOperativo = Deno.env.get("LIGA_NOTIFICACIONES_MODO") === "operativo";
  const allowlist = parseAllowlist(Deno.env.get("LIGA_NOTIFICACIONES_ALLOWLIST"));
  if (!modoOperativo && allowlist.size === 0) {
    return json(req, 200, {
      ok: true,
      enviosReales: true,
      procesados: 0,
      enviados: 0,
      escritos: 0,
      fuera_allowlist: 0,
    });
  }

  const pedido = await leerPedido(req);
  const loteId = pedido.loteId;
  if (!loteId && !pedido.programadas) {
    return json(req, 200, {
      ok: true,
      enviosReales: true,
      procesados: 0,
      enviados: 0,
      escritos: 0,
      motivo: "lote_requerido",
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
  const replyTo = parseReplyTo(Deno.env.get("LIGA_NOTIFICACIONES_REPLY_TO"));

  let procesados = 0;
  let escritos = 0;
  let aceptados = 0;
  let omitidos = 0;
  let errores = 0;
  let reintentos = 0;
  let fueraAllowlist = 0;

  let consulta = supabase
    .from("liga_notificaciones_queue")
    .select(
      loteId
        ? "id, liga_id, liga_jugador_id, idempotency_key, estado, attempts, tipo, asunto, cuerpo_texto, lote_id"
        : "id, liga_id, liga_jugador_id, idempotency_key, estado, attempts, tipo, asunto, cuerpo_texto, lote_id, jornada_id, jornada_numero",
    )
    .eq("estado", "pendiente");
  consulta = loteId
    ? consulta.eq("lote_id", loteId)
    : consulta
      .eq("origen", "automatico")
      .lte("programado_para", new Date().toISOString())
      .in("tipo", ["resultados_jornada", "recordatorio_jornada", "bienvenida"]);
  const { data: pendientes, error: listErr } = await consulta
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (listErr) {
    return json(req, 500, { ok: false, error: "cola_no_disponible" });
  }

  for (const raw of pendientes ?? []) {
    const row = raw as QueueRow;
    procesados += 1;
    const previo = await leerElegibilidad0100(supabase, row);
    const decision = decidirReclamo({
      email: previo.email,
      allowlist,
      modoOperativo,
      pref: previo.pref,
    });
    if (!decision.reclamar) {
      if (decision.motivo === "fuera_de_allowlist") {
        fueraAllowlist += 1;
        continue;
      }
      await finalizarMensaje(supabase, row, {
        estado: decision.motivo === "deshabilitado" ? "pausado" : "omitido",
        motivo: decision.motivo,
        proveedor: null,
      });
      omitidos += 1;
      continue;
    }

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
      .select(
        "id, liga_id, liga_jugador_id, idempotency_key, attempts, tipo, asunto, cuerpo_texto, lote_id",
      )
      .maybeSingle();

    if (claimErr || !claimed) continue;
    escritos += 1;

    const outcome = await enviarReclamado(supabase, {
      id: claimed.id as string,
      liga_id: claimed.liga_id as string,
      liga_jugador_id: claimed.liga_jugador_id as string,
      idempotency_key: claimed.idempotency_key as string,
      attempts: Number(claimed.attempts ?? nextAttempts),
      tipo: String(claimed.tipo ?? row.tipo ?? "bienvenida"),
      asunto: (claimed.asunto as string | null) ?? row.asunto,
      cuerpo_texto: (claimed.cuerpo_texto as string | null) ?? row.cuerpo_texto,
      lote_id: (claimed.lote_id as string | null) ?? row.lote_id,
    }, replyTo);

    if (outcome === "aceptado") aceptados += 1;
    else if (outcome === "omitido") omitidos += 1;
    else if (outcome === "reintento") reintentos += 1;
    else errores += 1;
  }

  if (!loteId) {
    await emitirCopiasSupervision(
      supabase,
      (pendientes ?? []) as QueueRow[],
    );
  }

  return json(req, 200, {
    ok: true,
    enviosReales: true,
    procesados,
    escritos,
    aceptados,
    omitidos,
    enviados: aceptados,
    errores,
    fuera_allowlist: fueraAllowlist,
    pendientes: fueraAllowlist + reintentos,
    replyTo: Boolean(replyTo),
  });
});

async function leerElegibilidad0100(
  supabase: ReturnType<typeof createCredentialClient>,
  row: { liga_id: string; liga_jugador_id: string },
): Promise<{
  pref: PrefRow | null;
  email: string | null;
  nombre: string;
  ligaNombre: string;
  clubNombre: string;
  branding: LigaMailBranding;
}> {
  const { data: pref } = await supabase
    .from("liga_notificaciones_preferencias")
    .select(
      "admin_habilitado, consentimiento_estado, consentimiento_origen, consentimiento_registrado_at",
    )
    .eq("liga_id", row.liga_id)
    .eq("liga_jugador_id", row.liga_jugador_id)
    .maybeSingle();

  const { data: jugador } = await supabase
    .from("liga_jugadores")
    .select("nombre, email")
    .eq("id", row.liga_jugador_id)
    .maybeSingle();

  let email = (jugador?.email as string | null) ?? null;
  const nombre = (jugador?.nombre as string | null) ?? "Jugador";

  const { data: contacto } = await supabase.rpc("liga_jugador_resolver_contacto", {
    p_liga_jugador_id: row.liga_jugador_id,
  });
  const filaContacto = Array.isArray(contacto) ? contacto[0] : contacto;
  const contactoTipado = filaContacto as {
    email?: string | null;
  } | null;
  const emailGlobal = contactoTipado?.email ?? null;
  if (emailGlobal) email = emailGlobal;

  const { data: liga } = await supabase
    .from("ligas")
    .select("nombre, organizador_id")
    .eq("id", row.liga_id)
    .maybeSingle();

  const ligaNombre = String(liga?.nombre ?? "tu liga");
  let clubNombre = "Riviera Open";
  let brandingKey: string | null = null;
  let premiumEnabled = false;

  const organizadorId = (liga as { organizador_id?: string | null } | null)?.organizador_id ?? null;
  if (organizadorId) {
    const { data: ogm } = await supabase
      .from("organizador_game_modes")
      .select("branding_key, premium_branding_enabled")
      .eq("organizador_id", organizadorId)
      .maybeSingle();

    brandingKey = (ogm as { branding_key?: string | null } | null)?.branding_key ?? null;
    premiumEnabled = Boolean((ogm as { premium_branding_enabled?: boolean } | null)?.premium_branding_enabled);

    const { data: displayName } = await supabase.rpc("get_organizador_display_name", {
      p_organizador_id: organizadorId,
    });
    if (displayName && typeof displayName === "string" && displayName.trim()) {
      clubNombre = displayName.trim();
    }
  }

  const branding = resolveLigaMailBrandingWorker({
    clubNombre,
    brandingKey,
    premiumBrandingEnabled: premiumEnabled,
    appBaseUrl: publicBase(),
  });

  return {
    pref: (pref as PrefRow | null) ?? null,
    email: isFakeOrInvalidEmail(email) ? null : email,
    nombre,
    ligaNombre,
    clubNombre: branding.brandName,
    branding,
  };
}

async function enviarReclamado(
  supabase: ReturnType<typeof createCredentialClient>,
  row: {
    id: string;
    liga_id: string;
    liga_jugador_id: string;
    idempotency_key: string;
    attempts: number;
    tipo: string;
    asunto: string | null;
    cuerpo_texto: string | null;
    lote_id: string | null;
  },
  replyTo: string | null,
): Promise<"aceptado" | "omitido" | "error" | "reintento"> {
  const otraVez = await leerElegibilidad0100(supabase, row);
  const allowlist = parseAllowlist(Deno.env.get("LIGA_NOTIFICACIONES_ALLOWLIST"));
  const decision = decidirReclamo({
    email: otraVez.email,
    allowlist,
    modoOperativo: Deno.env.get("LIGA_NOTIFICACIONES_MODO") === "operativo",
    pref: otraVez.pref,
  });
  if (!decision.reclamar) {
    await finalizarMensaje(supabase, row, {
      estado: "omitido",
      motivo: decision.motivo,
      proveedor: null,
    });
    return "omitido";
  }

  const emailNorm = otraVez.email!.trim().toLowerCase();
  const cuerpoResuelto = (row.cuerpo_texto ?? "")
    .replace(/\{\{\s*nombre\s*\}\}/gi, otraVez.nombre)
    .replace(/\{\{\s*liga\s*\}\}/gi, otraVez.ligaNombre)
    .replace(/\{\{\s*club\s*\}\}/gi, otraVez.clubNombre);
  if (
    row.tipo === "recordatorio_jornada" &&
    !recordatorioTieneHorarioOficial(cuerpoResuelto)
  ) {
    await finalizarMensaje(supabase, row, {
      estado: "omitido",
      motivo: "jornada_sin_horario",
      proveedor: null,
    });
    return "omitido";
  }
  if (cuerpoResuelto.includes("{{") || (row.asunto ?? "").includes("{{")) {
    await finalizarMensaje(supabase, row, {
      estado: "omitido",
      motivo: "plantilla_incompleta",
      proveedor: null,
    });
    return "omitido";
  }
  if (
    row.tipo === "resultados_jornada" &&
    !extraerUrlPublicaJornadaWorker(cuerpoResuelto, publicBase())
  ) {
    await finalizarMensaje(supabase, row, {
      estado: "omitido",
      motivo: "sin_url_publica",
      proveedor: null,
    });
    return "omitido";
  }
  const esManual = Boolean(row.lote_id || row.cuerpo_texto);
  const ligaUrl = `${publicBase()}/public/liga/${row.liga_id}`;
  const mail = esManual
    ? renderComunicacionWorker({
      clubNombre: otraVez.clubNombre,
      ligaNombre: otraVez.ligaNombre,
      asunto: (row.asunto ?? `Mensaje de ${otraVez.ligaNombre}`).replace(/\{\{\s*club\s*\}\}/gi, otraVez.clubNombre),
      cuerpoTexto: cuerpoResuelto,
      replyTo,
      branding: otraVez.branding,
      tipo: row.tipo,
      ligaUrl,
    })
    : renderBienvenidaWorker({
      clubNombre: otraVez.clubNombre,
      ligaNombre: otraVez.ligaNombre,
      jugadorNombre: otraVez.nombre,
      perfilUrl: ligaUrl,
      ligaUrl,
      branding: otraVez.branding,
    });

  if (mail.asunto.includes("{{") || mail.html.includes("{{") || mail.text.includes("{{")) {
    await finalizarMensaje(supabase, row, {
      estado: "omitido",
      motivo: "plantilla_incompleta",
      proveedor: null,
    });
    return "omitido";
  }

  const send = await sendByResend(
    emailNorm,
    mail.asunto,
    mail.text,
    mail.html,
    { function: MODULE, tipo: row.tipo, queue_id: row.id },
    row.idempotency_key,
    replyTo,
  );

  if (send.ok) {
    await finalizarMensaje(supabase, row, {
      estado: "enviado",
      motivo: null,
      proveedor: "aceptado",
    });
    return "aceptado";
  }

  const clase = classifyResendFailure(send.status);
  if (send.status === 0 && !row.lote_id) {
    await finalizarMensaje(supabase, row, {
      estado: "error",
      motivo: "respuesta_ambigua",
      proveedor: null,
    });
    return "error";
  }
  if (clase === "temporal" && row.attempts < MAX_ATTEMPTS) {
    await supabase
      .from("liga_notificaciones_queue")
      .update({
        estado: "pendiente",
        motivo: "error_temporal",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("estado", "procesando");
    await supabase.from("liga_notificaciones_log").insert({
      liga_id: row.liga_id,
      liga_jugador_id: row.liga_jugador_id,
      queue_id: row.id,
      tipo: TIPOS_LOG.has(row.tipo) ? row.tipo : "bienvenida",
      estado: "pendiente",
      attempts: row.attempts,
      motivo: "error_temporal",
      proveedor_estado: null,
    });
    return "reintento";
  }

  await finalizarMensaje(supabase, row, {
    estado: "error",
    motivo: clase === "temporal" ? "error_temporal" : "error_permanente",
    proveedor: null,
  });
  return "error";
}

async function finalizarMensaje(
  supabase: ReturnType<typeof createCredentialClient>,
  row: {
    id: string;
    liga_id: string;
    liga_jugador_id: string;
    attempts: number;
    tipo?: string;
  },
  result: {
    estado: string;
    motivo: string | null;
    proveedor: "aceptado" | "entregado" | null;
  },
) {
  const tipo = row.tipo && TIPOS_LOG.has(row.tipo) ? row.tipo : "bienvenida";
  await supabase
    .from("liga_notificaciones_queue")
    .update({
      estado: result.estado,
      motivo: result.motivo,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("estado", ["pendiente", "procesando"]);

  await supabase.from("liga_notificaciones_log").insert({
    liga_id: row.liga_id,
    liga_jugador_id: row.liga_jugador_id,
    queue_id: row.id,
    tipo,
    estado: result.estado,
    attempts: row.attempts,
    motivo: result.motivo,
    proveedor_estado: result.proveedor,
  });
}

async function emitirCopiasSupervision(
  supabase: ReturnType<typeof createCredentialClient>,
  filas: QueueRow[],
): Promise<void> {
  const grupos = new Map<string, { ligaId: string; tipo: string; eventoId: string; numero: number | null }>();
  for (const fila of filas) {
    const eventoId = fila.tipo === "bienvenida" ? fila.liga_jugador_id : fila.jornada_id;
    if (!eventoId) continue;
    const clave = `supervision:${fila.tipo}:${fila.liga_id}:${eventoId}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        ligaId: fila.liga_id,
        tipo: fila.tipo,
        eventoId,
        numero: fila.jornada_numero ?? null,
      });
    }
  }

  for (const [clave, grupo] of grupos) {
    try {
      await enviarCopiaSupervision(supabase, clave, grupo);
    } catch {
      // La copia no puede repetir ni deshacer el envío a los jugadores.
    }
  }
}

async function resolverContextoLigaSupervision(
  supabase: ReturnType<typeof createCredentialClient>,
  ligaId: string,
): Promise<{ ligaNombre: string; clubNombre: string; branding: LigaMailBranding }> {
  const { data: liga } = await supabase
    .from("ligas")
    .select("nombre, organizador_id")
    .eq("id", ligaId)
    .maybeSingle();
  const ligaNombre = String(liga?.nombre ?? "Liga").slice(0, 120);
  let clubNombre = "Riviera Open";
  let brandingKey: string | null = null;
  let premiumEnabled = false;
  const organizadorId =
    (liga as { organizador_id?: string | null } | null)?.organizador_id ?? null;
  if (organizadorId) {
    const { data: ogm } = await supabase
      .from("organizador_game_modes")
      .select("branding_key, premium_branding_enabled")
      .eq("organizador_id", organizadorId)
      .maybeSingle();
    brandingKey =
      (ogm as { branding_key?: string | null } | null)?.branding_key ?? null;
    premiumEnabled = Boolean(
      (ogm as { premium_branding_enabled?: boolean } | null)
        ?.premium_branding_enabled,
    );
    const { data: displayName } = await supabase.rpc(
      "get_organizador_display_name",
      { p_organizador_id: organizadorId },
    );
    if (displayName && typeof displayName === "string" && displayName.trim()) {
      clubNombre = displayName.trim();
    }
  }
  const branding = resolveLigaMailBrandingWorker({
    clubNombre,
    brandingKey,
    premiumBrandingEnabled: premiumEnabled,
    appBaseUrl: publicBase(),
  });
  return {
    ligaNombre,
    clubNombre: branding.brandName,
    branding,
  };
}

async function enviarCopiaSupervision(
  supabase: ReturnType<typeof createCredentialClient>,
  clave: string,
  grupo: { ligaId: string; tipo: string; eventoId: string; numero: number | null },
): Promise<void> {
  const { data: config } = await supabase
    .from("liga_notificaciones_config")
    .select("supervision_activa, supervision_alcance, supervision_email")
    .eq("liga_id", grupo.ligaId)
    .maybeSingle();
  const email = String(config?.supervision_email ?? "").trim().toLowerCase();
  const alcance = config?.supervision_alcance === "todas" ? "todas" : "resultados";
  const tipoPermitido = alcance === "todas" || grupo.tipo === "resultados_jornada";
  const correoGuardado = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)
    && email.length <= 180
    && !email.endsWith("@padel.local");
  if (
    config?.supervision_activa !== true ||
    !correoGuardado ||
    !tipoPermitido
  ) {
    return;
  }

  let estadosQuery = supabase
    .from("liga_notificaciones_queue")
    .select("estado, asunto, cuerpo_texto")
    .eq("liga_id", grupo.ligaId)
    .eq("tipo", grupo.tipo)
    .eq("origen", "automatico");
  estadosQuery = grupo.tipo === "bienvenida"
    ? estadosQuery.eq("liga_jugador_id", grupo.eventoId)
    : estadosQuery.eq("jornada_id", grupo.eventoId);
  const { data: filasCola } = await estadosQuery;
  const lista = filasCola ?? [];
  const aceptados = lista.filter((fila) => fila.estado === "enviado").length;
  const errores = lista.filter((fila) => fila.estado === "error").length;
  const reintentos = lista.filter((fila) => fila.estado === "pendiente").length;

  const muestra =
    lista.find((fila) => Boolean(fila.cuerpo_texto?.trim())) ?? lista[0] ?? null;
  if (!muestra?.cuerpo_texto?.trim()) return;

  const ctx = await resolverContextoLigaSupervision(supabase, grupo.ligaId);
  const ligaNombre = ctx.ligaNombre;
  const clubNombre = ctx.clubNombre;
  const numero = grupo.numero != null ? String(grupo.numero) : "";
  const ligaUrl = `${publicBase()}/public/liga/${grupo.ligaId}`;
  const jornadaUrlExplicit =
    numero && (grupo.tipo === "resultados_jornada" || grupo.tipo === "recordatorio_jornada")
      ? `${ligaUrl}/jornada/${numero}`
      : null;

  const cuerpoResuelto = String(muestra.cuerpo_texto)
    .replace(/\{\{\s*nombre\s*\}\}/gi, NOMBRE_EJEMPLO_SUPERVISION)
    .replace(/\{\{\s*liga\s*\}\}/gi, ligaNombre)
    .replace(/\{\{\s*club\s*\}\}/gi, clubNombre);
  const asuntoResuelto = String(muestra.asunto ?? `Mensaje de ${ligaNombre}`)
    .replace(/\{\{\s*nombre\s*\}\}/gi, NOMBRE_EJEMPLO_SUPERVISION)
    .replace(/\{\{\s*liga\s*\}\}/gi, ligaNombre)
    .replace(/\{\{\s*club\s*\}\}/gi, clubNombre)
    .slice(0, 180);

  if (cuerpoResuelto.includes("{{") || asuntoResuelto.includes("{{")) return;
  if (cuerpoResuelto.includes("@") || asuntoResuelto.includes("@")) return;

  const jornadaUrl =
    jornadaUrlExplicit ??
    extraerUrlPublicaJornadaWorker(cuerpoResuelto, publicBase());

  const copia = construirCorreoSupervision({
    liga: ligaNombre,
    club: clubNombre,
    jornada: numero,
    tipo: grupo.tipo,
    procesados: lista.length,
    aceptados,
    errores,
    reintentos,
    branding: ctx.branding,
    asuntoEnviado: asuntoResuelto,
    cuerpoEnviado: cuerpoResuelto,
    ligaUrl,
    jornadaUrl,
    nombreEjemplo: NOMBRE_EJEMPLO_SUPERVISION,
  });
  if (!copia.ok) return;
  if (copia.text.includes("@") || copia.html.includes("@")) return;

  const { error: alta } = await supabase.from("liga_notificaciones_log").insert({
    liga_id: grupo.ligaId,
    liga_jugador_id: null,
    tipo: "supervision",
    origen: "automatico",
    estado: "procesando",
    attempts: 1,
    idempotency_key: clave,
    jornada_id: grupo.tipo === "bienvenida" ? null : grupo.eventoId,
    jornada_numero: grupo.numero,
    procesados: lista.length,
    aceptados,
    errores,
    reintentos,
  });
  if (alta) return;

  const send = await sendByResend(
    email,
    copia.asunto,
    copia.text,
    copia.html,
    { function: MODULE, tipo: "supervision" },
    clave,
    null,
  );
  await supabase
    .from("liga_notificaciones_log")
    .update({
      estado: send.ok ? "enviado" : "error",
      motivo: send.ok ? null : send.status === 0 ? "respuesta_ambigua" : "error_proveedor",
      proveedor_estado: send.ok ? "aceptado" : null,
    })
    .eq("idempotency_key", clave)
    .eq("estado", "procesando");
}
