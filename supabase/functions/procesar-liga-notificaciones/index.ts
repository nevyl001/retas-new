/**
 * Worker de bienvenida de liga.
 *
 * Esta fase no envía correos y no escribe la cola. Aunque
 * LIGA_NOTIFICACIONES_ENVIOS_REALES sea "true", responde sin llamar a Resend:
 * el envío real queda para una autorización posterior.
 * No usa notificaciones_eventos_queue ni el worker de Torneo Express.
 */
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const SECRET_HEADER = "x-liga-notificaciones-secret";

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

  return json(req, 409, {
    ok: false,
    enviosReales: false,
    procesados: 0,
    escritos: 0,
    error: "procesador_no_habilitado",
  });
});
