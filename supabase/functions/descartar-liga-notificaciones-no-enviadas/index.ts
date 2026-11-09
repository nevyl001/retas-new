/**
 * El administrador autenticado quita filas de su historial.
 * Una fila concreta puede ser aceptada o entregada. La limpieza general
 * sigue limitada a lo que no se envió. Nunca borra un envío en proceso.
 */
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  createCredentialClient,
  readPublishableCredential,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COLA_NO_ENVIADA = ["pendiente", "error", "omitido", "pausado"];
const COLA_FILA = [...COLA_NO_ENVIADA, "enviado"];

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function logDescartable(row: {
  estado?: string | null;
  proveedor_estado?: string | null;
}): boolean {
  if (row.estado === "enviado" || row.estado === "procesando") return false;
  if (row.proveedor_estado === "aceptado" || row.proveedor_estado === "entregado") {
    return false;
  }
  return true;
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

  let body: { liga_id?: string; queue_id?: string; log_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "cuerpo_invalido" });
  }

  const ligaId = body.liga_id?.trim() ?? "";
  const queueId = body.queue_id?.trim() ?? "";
  const logId = body.log_id?.trim() ?? "";
  if (!UUID.test(ligaId) || (queueId && !UUID.test(queueId)) || (logId && !UUID.test(logId))) {
    return json(req, 400, { ok: false, error: "identificador_invalido" });
  }
  if (queueId && logId) {
    return json(req, 400, { ok: false, error: "identificador_invalido" });
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
  if (userError || !user) {
    return json(req, 401, { ok: false, error: "sesion_invalida" });
  }

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
  if (!permitido) {
    return json(req, 403, { ok: false, error: "sin_permiso" });
  }

  let admin;
  try {
    admin = createCredentialClient(supabaseUrl, readSecretCredential());
  } catch {
    return json(req, 503, { ok: false, error: "procesador_no_configurado" });
  }

  if (queueId) {
    const { data: row, error } = await admin
      .from("liga_notificaciones_queue")
      .select("id, estado")
      .eq("id", queueId)
      .eq("liga_id", ligaId)
      .maybeSingle();
    if (error) return json(req, 500, { ok: false, error: "cola_no_disponible" });
    if (!row) return json(req, 404, { ok: false, error: "no_encontrado" });
    if (row.estado === "procesando" || !COLA_FILA.includes(row.estado)) {
      return json(req, 409, { ok: false, error: "en_proceso" });
    }
    const { error: deleteError } = await admin
      .from("liga_notificaciones_queue")
      .delete()
      .eq("id", queueId)
      .eq("liga_id", ligaId)
      .in("estado", COLA_FILA);
    if (deleteError) return json(req, 500, { ok: false, error: "cola_no_disponible" });
    const { error: logsError } = await admin
      .from("liga_notificaciones_log")
      .delete()
      .eq("liga_id", ligaId)
      .eq("queue_id", queueId)
      .neq("estado", "procesando");
    if (logsError) return json(req, 500, { ok: false, error: "cola_no_disponible" });
    return json(req, 200, { ok: true, descartados: 1 });
  }

  if (logId) {
    const { data: row, error } = await admin
      .from("liga_notificaciones_log")
      .select("id, estado, proveedor_estado, queue_id")
      .eq("id", logId)
      .eq("liga_id", ligaId)
      .maybeSingle();
    if (error) return json(req, 500, { ok: false, error: "cola_no_disponible" });
    if (!row) return json(req, 404, { ok: false, error: "no_encontrado" });
    if (row.estado === "procesando") {
      return json(req, 409, { ok: false, error: "en_proceso" });
    }
    const { error: deleteError } = await admin
      .from("liga_notificaciones_log")
      .delete()
      .eq("id", logId)
      .eq("liga_id", ligaId)
      .neq("estado", "procesando");
    if (deleteError) return json(req, 500, { ok: false, error: "cola_no_disponible" });
    if (row.queue_id) {
      const { error: colaError } = await admin
        .from("liga_notificaciones_queue")
        .delete()
        .eq("id", row.queue_id)
        .eq("liga_id", ligaId)
        .in("estado", COLA_FILA);
      if (colaError) return json(req, 500, { ok: false, error: "cola_no_disponible" });
    }
    return json(req, 200, { ok: true, descartados: 1 });
  }

  const { data: cola, error: colaError } = await admin
    .from("liga_notificaciones_queue")
    .delete()
    .eq("liga_id", ligaId)
    .in("estado", COLA_NO_ENVIADA)
    .select("id");
  if (colaError) return json(req, 500, { ok: false, error: "cola_no_disponible" });

  const { data: logs, error: logError } = await admin
    .from("liga_notificaciones_log")
    .select("id, estado, proveedor_estado")
    .eq("liga_id", ligaId);
  if (logError) return json(req, 500, { ok: false, error: "cola_no_disponible" });

  const logIds = (logs ?? []).filter(logDescartable).map((row) => row.id);
  if (logIds.length > 0) {
    const { error: deleteLogs } = await admin
      .from("liga_notificaciones_log")
      .delete()
      .eq("liga_id", ligaId)
      .in("id", logIds);
    if (deleteLogs) return json(req, 500, { ok: false, error: "cola_no_disponible" });
  }

  return json(req, 200, {
    ok: true,
    descartados: (cola ?? []).length + logIds.length,
  });
});
