/**
 * Pide el enlace de posesión del correo de supervisión.
 * No crea el token ni escribe si la verificación no está habilitada.
 * Ese interruptor no abre la cola de jugadores.
 * El token no vuelve en la respuesta ni se registra en el asunto.
 */
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendByResend } from "../_shared/resendEmail.ts";
import {
  createCredentialClient,
  readPublishableCredential,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";
import {
  brandingNeutro,
  renderVerificacionSupervision,
} from "../../../src/lib/liga/notificaciones/correoCompartido.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  let body: { liga_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "cuerpo_invalido" });
  }
  const ligaId = body.liga_id?.trim() ?? "";
  if (!UUID.test(ligaId)) return json(req, 400, { ok: false, error: "liga_invalida" });

  if (Deno.env.get("LIGA_NOTIFICACIONES_VERIFICACION_SUPERVISION") !== "true") {
    return json(req, 200, { ok: true, enviosReales: false, motivo: "verificacion_apagada" });
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
  const admin = createCredentialClient(supabaseUrl, credencial);
  const { data, error } = await admin.rpc(
    "liga_notificaciones_emitir_verificacion_supervision",
    { p_liga_id: ligaId, p_actor: user.id },
  );
  const resultado = (data ?? {}) as { ok?: boolean; motivo?: string; token?: string; email?: string };
  if (error || resultado.ok === false || !resultado.token || !resultado.email) {
    return json(req, 200, {
      ok: false,
      enviosReales: true,
      motivo: resultado.motivo || "no_disponible",
    });
  }

  const base = (Deno.env.get("PUBLIC_APP_URL") ?? "https://appriviera.rivieraopen.com")
    .trim()
    .replace(/\/+$/, "");
  const enlace = `${base}/public/verificar-correo?s=${resultado.token}`;
  const correo = renderVerificacionSupervision({
    branding: brandingNeutro(String(liga?.nombre ?? "")),
    enlace,
  });
  if (!correo) {
    await admin.rpc("liga_notificaciones_anular_verificacion_supervision", {
      p_liga_id: ligaId,
    });
    return json(req, 200, { ok: false, enviosReales: true, motivo: "enlace_invalido" });
  }
  const send = await sendByResend(
    resultado.email,
    correo.asunto,
    correo.text,
    correo.html,
    { function: "enviar-verificacion-supervision-liga" },
    `supervision-verificacion:${ligaId}:${crypto.randomUUID()}`,
    null,
  );
  if (!send.ok) {
    await admin.rpc("liga_notificaciones_anular_verificacion_supervision", {
      p_liga_id: ligaId,
    });
    return json(req, 200, {
      ok: false,
      enviosReales: true,
      motivo: send.status === 0 ? "respuesta_ambigua" : "error_proveedor",
    });
  }
  return json(req, 200, { ok: true, enviosReales: true, motivo: null });
});
