/**
 * El administrador autenticado pide procesar solo su lote.
 * El secreto del worker no sale de esta función.
 * Con envíos reales apagados no escribe la cola ni llama al worker.
 */
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  createCredentialClient,
  readPublishableCredential,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function apagado(req: Request, motivo: string) {
  return json(req, 200, {
    ok: true,
    enviosReales: false,
    enviados: 0,
    omitidos: 0,
    errores: 0,
    procesados: 0,
    motivo,
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

  let body: {
    liga_id?: string;
    lote_id?: string;
    reintentar?: boolean;
    tipo?: string;
    jugadores?: { jugador_id?: string; asunto?: string; cuerpo?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "cuerpo_invalido" });
  }

  const ligaId = body.liga_id?.trim() ?? "";
  const loteId = body.lote_id?.trim() ?? "";
  if (!UUID.test(ligaId) || !UUID.test(loteId)) {
    return json(req, 400, { ok: false, error: "lote_invalido" });
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

  const reales = Deno.env.get("LIGA_NOTIFICACIONES_ENVIOS_REALES") === "true";
  const modoOperativo = Deno.env.get("LIGA_NOTIFICACIONES_MODO") === "operativo";
  const allowlist = (Deno.env.get("LIGA_NOTIFICACIONES_ALLOWLIST") ?? "").trim();
  if (!reales) return apagado(req, "envios_apagados");
  if (!modoOperativo && !allowlist) return apagado(req, "modo_prueba");

  const webhook = Deno.env.get("LIGA_NOTIFICACIONES_WEBHOOK_SECRET") ?? "";
  if (!webhook) {
    return json(req, 503, { ok: false, error: "procesador_no_configurado" });
  }

  let credencial = "";
  try {
    credencial = readSecretCredential();
  } catch {
    return json(req, 503, { ok: false, error: "procesador_no_configurado" });
  }
  const admin = createCredentialClient(supabaseUrl, credencial);

  const jugadores = Array.isArray(body.jugadores) ? body.jugadores : [];
  if (jugadores.length > 50) {
    return json(req, 400, { ok: false, error: "demasiados_destinatarios" });
  }
  const tipos = new Set([
    "bienvenida",
    "aviso_general",
    "jornada",
    "cambio_horario",
    "felicitacion",
    "personalizado",
  ]);
  const tipo = (body.tipo ?? "").trim();
  for (const jugador of jugadores) {
    const jugadorId = jugador?.jugador_id?.trim() ?? "";
    if (!UUID.test(jugadorId)) continue;
    const patch: Record<string, string> = {
      lote_id: loteId,
      updated_at: new Date().toISOString(),
    };
    const asunto = jugador.asunto?.trim() ?? "";
    const cuerpo = jugador.cuerpo?.trim() ?? "";
    if (asunto) patch.asunto = asunto.slice(0, 180);
    if (cuerpo) patch.cuerpo_texto = cuerpo.slice(0, 8000);
    let consulta = admin
      .from("liga_notificaciones_queue")
      .update(patch)
      .eq("liga_id", ligaId)
      .eq("liga_jugador_id", jugadorId)
      .eq("estado", "pendiente");
    if (tipos.has(tipo)) consulta = consulta.eq("tipo", tipo);
    const { error: adopcionError } = await consulta;
    if (adopcionError) {
      return json(req, 500, { ok: false, error: "cola_no_disponible" });
    }
  }

  const { count, error: countError } = await admin
    .from("liga_notificaciones_queue")
    .select("id", { count: "exact", head: true })
    .eq("liga_id", ligaId)
    .eq("lote_id", loteId);
  if (countError) {
    return json(req, 500, { ok: false, error: "cola_no_disponible" });
  }
  if (!count) {
    return json(req, 404, { ok: false, error: "lote_no_encontrado" });
  }

  if (body.reintentar === true) {
    const { error: retryError } = await admin
      .from("liga_notificaciones_queue")
      .update({
        estado: "pendiente",
        motivo: null,
        updated_at: new Date().toISOString(),
      })
      .eq("liga_id", ligaId)
      .eq("lote_id", loteId)
      .eq("estado", "error");
    if (retryError) {
      return json(req, 500, { ok: false, error: "cola_no_disponible" });
    }
  }

  let worker: Response;
  try {
    worker = await fetch(
      `${supabaseUrl}/functions/v1/procesar-liga-notificaciones`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: credencial,
          Authorization: `Bearer ${credencial}`,
          "x-liga-notificaciones-secret": webhook,
        },
        body: JSON.stringify({ lote_id: loteId }),
        signal: AbortSignal.timeout(55000),
      },
    );
  } catch {
    return json(req, 504, {
      ok: false,
      enviosReales: true,
      enviados: 0,
      omitidos: 0,
      errores: 1,
      procesados: 0,
      fuera_allowlist: 0,
      motivo: "procesador_no_disponible",
    });
  }

  let resultado: Record<string, unknown> = {};
  try {
    resultado = await worker.json();
  } catch {
    resultado = {};
  }
  if (!worker.ok) {
    return json(req, 502, {
      ok: false,
      enviosReales: true,
      enviados: 0,
      omitidos: 0,
      errores: 1,
      procesados: 0,
      motivo: "procesador_no_disponible",
    });
  }

  return json(req, 200, {
    ok: resultado.ok !== false,
    enviosReales: resultado.enviosReales === true,
    enviados: Number(resultado.enviados ?? 0),
    omitidos: Number(resultado.omitidos ?? 0),
    errores: Number(resultado.errores ?? 0),
    procesados: Number(resultado.procesados ?? 0),
    fuera_allowlist: Number(resultado.fuera_allowlist ?? 0),
    pendientes: Number(resultado.pendientes ?? resultado.fuera_allowlist ?? 0),
    motivo: typeof resultado.motivo === "string" ? resultado.motivo : null,
  });
});
