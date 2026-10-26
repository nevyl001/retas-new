import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  createCredentialClient,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";

/**
 * Supabase Edge Function: rewards-retry-accruals
 * Permite ejecutar la reconciliación periódica y reintentos automáticos
 * de Riviera Rewards en servidor sin depender de pg_cron ni de sesión de navegador.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions();
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    let secretKey = "";
    try {
      secretKey = readSecretCredential();
    } catch {
      secretKey = "";
    }

    if (!supabaseUrl || !secretKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Variables de entorno de Supabase no configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createCredentialClient(supabaseUrl, secretKey);

    const { data, error } = await supabase.rpc("rewards_retry_accruals", { p_limit: 100 });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, processed: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

