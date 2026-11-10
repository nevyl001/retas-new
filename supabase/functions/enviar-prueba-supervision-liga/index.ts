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
import {
  autorizarPruebaSupervision,
  brandingNeutro,
  prepararPruebaSupervision,
} from "../../../src/lib/liga/notificaciones/correoCompartido.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASUNTO = "[PRUEBA] AppRiviera — Notificación de jornada";
const AVISO = "ESTE ES UN CORREO DE PRUEBA. NO CORRESPONDE A UNA NOTIFICACIÓN OFICIAL.";
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
  const plantilla = body.plantilla;
  let preparado: ReturnType<typeof prepararPruebaSupervision> | null = null;
  if (plantilla) {
    preparado = prepararPruebaSupervision({
      asunto: String(plantilla.asunto ?? ""),
      cuerpo: String(plantilla.cuerpo ?? ""),
      tipo: plantilla.tipo,
      clubNombre: String(plantilla.club_nombre ?? ""),
      ligaNombre: String(plantilla.liga_nombre ?? ""),
      branding: brandingNeutro(String(plantilla.club_nombre ?? "")),
      ligaUrl: plantilla.liga_url,
      jornadaUrl: plantilla.jornada_url,
    });
  }

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
    .select("id, organizador_id")
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
  if (preparado && preparado.ok === false) {
    return json(req, 200, { ok: false, enviosReales: true, motivo: preparado.motivo });
  }
  const admin = createCredentialClient(supabaseUrl, credencial);
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
  const ficticio = [
    AVISO,
    "Liga de ejemplo",
    "Club de ejemplo",
    "Jornada de ejemplo",
    "Fecha de ejemplo",
    "Horario de ejemplo",
    "Los datos de esta vista son ficticios.",
    "Esta demostración no abre resultados oficiales ni acciones de administración.",
    "DEMOSTRACIÓN: https://appriviera.rivieraopen.com/",
  ].join("\n\n");
  const clave = `prueba:${ligaId}:${crypto.randomUUID()}`;
  const send = await sendByResend(
    reserva.email,
    preparado?.ok ? preparado.asunto : ASUNTO,
    preparado?.ok ? preparado.text : ficticio,
    preparado?.ok
      ? preparado.html
      : `<p>${AVISO}</p><p>Liga de ejemplo<br />Club de ejemplo<br />Jornada de ejemplo</p><p><a href="https://appriviera.rivieraopen.com/">DEMOSTRACIÓN</a></p>`,
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
