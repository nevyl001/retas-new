/**
 * Envía un solo correo de prueba al correo de supervisión ya verificado.
 * Usa LIGA_NOTIFICACIONES_PRUEBA_SUPERVISION. No lee ni habilita la cola de jugadores.
 */
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendByResend } from "../_shared/resendEmail.ts";
import {
  createCredentialClient,
  readPublishableCredential,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";
import { resolveLigaMailBrandingWorker } from "../_shared/ligaNotificacionesMail.ts";
import {
  autorizarPruebaSupervision,
  prepararPruebaSupervision,
} from "../../../src/lib/liga/notificaciones/correoCompartido.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DESTINO_PROHIBIDO = ["email", "to", "destinatario", "destinatarios", "liga_jugador_id"];

type PlantillaPrueba = {
  asunto?: string;
  cuerpo?: string;
  tipo?: string;
  liga_nombre?: string;
  club_nombre?: string;
  liga_url?: string;
  jornada_url?: string;
};

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "metodo_no_permitido" });
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, 401, { ok: false, error: "sesion_requerida" });
  }
  let body: { liga_id?: string; plantilla?: PlantillaPrueba; confirmar?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "cuerpo_invalido" });
  }
  if (DESTINO_PROHIBIDO.some((clave) => Object.prototype.hasOwnProperty.call(body, clave))) {
    return json(req, 400, { ok: false, error: "destino_no_permitido" });
  }
  const ligaId = body.liga_id?.trim() ?? "";
  if (!UUID.test(ligaId)) return json(req, 400, { ok: false, error: "liga_invalida" });
  const puerta = autorizarPruebaSupervision({
    pruebaHabilitada: Deno.env.get("LIGA_NOTIFICACIONES_PRUEBA_SUPERVISION") === "true",
    admin: true,
    confirmada: body.confirmar === true,
    verificada: true,
    enviosEnLaUltimaHora: 0,
  });
  if (!puerta.ok && (puerta.motivo === "prueba_apagada" || puerta.motivo === "confirmacion_requerida")) {
    return json(req, 200, {
      ok: false,
      enviosReales: false,
      motivo: puerta.motivo,
    });
  }
  const plantilla = body.plantilla;
  if (!plantilla?.asunto?.trim() || !plantilla.cuerpo?.trim()) {
    return json(req, 200, { ok: false, enviosReales: false, motivo: "plantilla_incompleta" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let publishable = "";
  try {
    publishable = readPublishableCredential();
  } catch {
    publishable = "";
  }
  if (!supabaseUrl || !publishable) {
    return json(req, 503, { ok: false, error: "supabase_no_configurado" });
  }
  const userClient = createCredentialClient(supabaseUrl, publishable, authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json(req, 401, { ok: false, error: "sesion_invalida" });

  const { data: liga } = await userClient
    .from("ligas")
    .select("id, organizador_id, nombre")
    .eq("id", ligaId)
    .maybeSingle();
  let permitido = liga?.organizador_id === user.id;
  if (!permitido) {
    const { data: master } = await userClient.rpc("is_master_admin");
    permitido = master === true;
  }
  if (!permitido) return json(req, 403, { ok: false, error: "sin_permiso" });

  let credencial = "";
  try {
    credencial = readSecretCredential();
  } catch {
    return json(req, 503, { ok: false, error: "procesador_no_configurado" });
  }
  if (!((Deno.env.get("RESEND_API_KEY") ?? "").startsWith("re_"))) {
    return json(req, 503, { ok: false, error: "resend_no_configurado" });
  }
  const admin = createCredentialClient(supabaseUrl, credencial);
  const organizadorId = (liga as { organizador_id?: string | null } | null)?.organizador_id ?? null;
  let brandingKey: string | null = null;
  let premiumEnabled = false;
  let clubNombre = "Riviera Open";
  if (organizadorId) {
    const { data: modos } = await admin
      .from("organizador_game_modes")
      .select("branding_key, premium_branding_enabled")
      .eq("organizador_id", organizadorId)
      .maybeSingle();
    brandingKey = (modos as { branding_key?: string | null } | null)?.branding_key ?? null;
    premiumEnabled = Boolean((modos as { premium_branding_enabled?: boolean } | null)?.premium_branding_enabled);
    const { data: displayName } = await admin.rpc("get_organizador_display_name", {
      p_organizador_id: organizadorId,
    });
    if (typeof displayName === "string" && displayName.trim()) clubNombre = displayName.trim();
  }
  const base = (Deno.env.get("PUBLIC_APP_URL") ?? "https://appriviera.rivieraopen.com")
    .trim()
    .replace(/\/+$/, "");
  const branding = resolveLigaMailBrandingWorker({
    clubNombre,
    brandingKey,
    premiumBrandingEnabled: premiumEnabled,
    appBaseUrl: base || "https://appriviera.rivieraopen.com",
  });
  const preparado = prepararPruebaSupervision({
    asunto: String(plantilla.asunto),
    cuerpo: String(plantilla.cuerpo),
    tipo: plantilla.tipo,
    clubNombre: branding.brandName,
    ligaNombre: String((liga as { nombre?: string | null } | null)?.nombre ?? plantilla.liga_nombre ?? ""),
    branding,
    ligaUrl: plantilla.liga_url,
    jornadaUrl: plantilla.jornada_url,
  });
  if (!preparado.ok) {
    return json(req, 200, { ok: false, enviosReales: false, motivo: preparado.motivo });
  }
  const { data, error } = await admin.rpc(
    "liga_notificaciones_reservar_prueba_supervision",
    { p_liga_id: ligaId, p_actor: user.id },
  );
  const reserva = (data ?? {}) as { ok?: boolean; motivo?: string; email?: string };
  if (error || reserva.ok === false || !reserva.email) {
    return json(req, 200, {
      ok: false,
      enviosReales: true,
      motivo: reserva.motivo || "correo_sin_verificacion",
    });
  }
  const clave = `prueba:${ligaId}:${crypto.randomUUID()}`;
  const send = await sendByResend(
    reserva.email,
    preparado.asunto,
    preparado.text,
    preparado.html,
    { function: "enviar-prueba-supervision-liga", tipo: "prueba" },
    clave,
    null,
  );
  if (!send.ok) {
    return json(req, 200, {
      ok: false,
      enviosReales: true,
      motivo: send.status === 0 ? "respuesta_ambigua" : "error_proveedor",
    });
  }
  await admin.from("liga_notificaciones_log").insert({
    liga_id: ligaId,
    liga_jugador_id: null,
    tipo: "prueba",
    origen: "prueba",
    estado: "enviado",
    attempts: 1,
    motivo: null,
    proveedor_estado: "aceptado",
    idempotency_key: clave,
    procesados: 0,
    aceptados: 1,
    errores: 0,
    reintentos: 0,
  });
  return json(req, 200, { ok: true, enviosReales: true, motivo: null });
});
