/**
 * La verificación por enlace quedó retirada.
 * Esta función no crea tokens, no escribe y no envía correos.
 */
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

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
  return json(req, 200, {
    ok: false,
    enviosReales: false,
    motivo: "verificacion_retirada",
  });
});
