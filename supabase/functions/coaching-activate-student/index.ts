import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { newCorrelationId, logError, logWarn } from "../_shared/logger.ts";
import { safeClientMessage, internalErrorDetail } from "../_shared/errors.ts";
import { checkRateLimit, rateLimitedResponse } from "../_shared/rateLimit.ts";

interface RequestBody {
  token?: string;
  password?: string;
}

const MAX_BODY_BYTES = 10_000;
const MODULE = "coaching-activate-student";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const correlationId = newCorrelationId();
  const jsonResponse = (status: number, payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido" });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { ok: false, error: "Solicitud demasiado grande" });
  }

  // =========================================================================
  // REGLA FUNDAMENTAL DE SEGURIDAD:
  // UNA SOLA ACTIVACIÓN DE CONTRASEÑA MEDIANTE GOTRUE CLIENTE.
  // Toda definición de contraseña se realiza mediante supabase.auth.updateUser({ password }).
  // Este endpoint NO modifica contraseñas ni altera app_metadata administrativamente.
  // =========================================================================
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, {
      ok: false,
      error:
        "Se requiere sesión autenticada del alumno para vincular el acceso. Abre el enlace enviado a tu correo.",
    });
  }

  const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseCaller.auth.getUser();

  if (callerError || !caller) {
    return jsonResponse(401, {
      ok: false,
      error: "Sesión de alumno inválida o expirada. Por favor abre el enlace enviado a tu correo.",
    });
  }

  if (!caller.email_confirmed_at) {
    return jsonResponse(400, {
      ok: false,
      needsEmailVerification: true,
      error:
        "El correo electrónico no ha sido verificado aún. Por favor abre el enlace enviado a tu correo antes de continuar.",
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Cuerpo de solicitud inválido" });
  }

  // Deshabilitar terminantemente el cambio de contraseñas por esta vía redundante
  if (body.password !== undefined && body.password !== null && body.password !== "") {
    return jsonResponse(400, {
      ok: false,
      error:
        "La modificación de contraseñas mediante este endpoint ha sido desactivada por seguridad. Toda contraseña debe ser definida directamente mediante supabase.auth.updateUser() con una sesión verificada del alumno.",
    });
  }

  const token = (body.token ?? "").trim();
  if (!token) {
    return jsonResponse(400, {
      ok: false,
      error: "Token de invitación no proporcionado.",
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Rate limiting por usuario contra abusos
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${caller.id}`, 10, 600);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: caller.id });
    return rateLimitedResponse(rl, cors);
  }

  try {
    // Delegar validación y vinculación a la RPC autorizada claim_student_invitation
    const { data: claimData, error: claimError } = await supabaseCaller.rpc(
      "claim_student_invitation",
      { p_token: token }
    );

    if (claimError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "claim_rpc_failed",
        detail: internalErrorDetail(claimError),
      });
      return jsonResponse(400, {
        ok: false,
        error: claimError.message || "No se pudo vincular la invitación.",
      });
    }

    if (!claimData || claimData.ok !== true) {
      return jsonResponse(400, {
        ok: false,
        error: claimData?.error || "No se pudo vincular la invitación.",
      });
    }

    return jsonResponse(200, {
      ok: true,
      email: caller.email,
      studentName: claimData.student_name,
      rivieraId: claimData.riviera_id,
      message: claimData.message || "¡Cuenta activada y vinculada exitosamente a Riviera Coaching!",
    });
  } catch (err) {
    logError({
      correlationId,
      module: MODULE,
      errorType: "unexpected_exception",
      detail: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    return jsonResponse(500, {
      ok: false,
      error: safeClientMessage(correlationId),
    });
  }
});
