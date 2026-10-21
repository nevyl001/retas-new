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

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validatePasswordPolicy(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "La contraseña debe incluir al menos una letra mayúscula." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "La contraseña debe incluir al menos una letra minúscula." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "La contraseña debe incluir al menos un número." };
  }
  return { valid: true };
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
  // REGLA FUNDAMENTAL DE SEGURIDAD 0081:
  // ELIMINAR CAPACIDAD ANÓNIMA DE CAMBIO DE CONTRASEÑA.
  // Nunca permitir que un token de invitación por sí solo modifique contraseñas.
  // Toda definición de contraseña exige una sesión autenticada del alumno.
  // =========================================================================
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, {
      ok: false,
      error:
        "Se requiere sesión autenticada del alumno para definir la contraseña. Las operaciones anónimas de cambio de contraseña están desactivadas por seguridad.",
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
        "El correo electrónico no ha sido verificado. Por favor abre el enlace enviado a tu correo antes de definir tu contraseña.",
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Cuerpo de solicitud inválido" });
  }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";

  if (!token) {
    return jsonResponse(400, {
      ok: false,
      error: "Token de invitación no proporcionado.",
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Rate limiting por IP o usuario contra abusos
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${caller.id}`, 10, 600);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: caller.id });
    return rateLimitedResponse(rl, cors);
  }

  try {
    // 2. Localizar invitación mediante hash SHA-256 (o token plano para compatibilidad)
    const tokenHash = await sha256Hex(token);

    const { data: invitations, error: invLookupError } = await supabaseAdmin
      .from("coach_student_invitations")
      .select("*")
      .or(`token_hash.eq.${tokenHash},invitation_token.eq.${token}`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (invLookupError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "invitation_lookup_failed",
        detail: internalErrorDetail(invLookupError),
      });
      return jsonResponse(500, { ok: false, error: safeClientMessage(correlationId) });
    }

    const invitation = invitations?.[0];

    if (!invitation) {
      return jsonResponse(404, {
        ok: false,
        error: "Invitación no válida o no encontrada.",
      });
    }

    if (invitation.status === "ACCEPTED") {
      return jsonResponse(400, {
        ok: false,
        error: "Esta invitación ya fue activada previamente. Inicia sesión con tu correo y contraseña.",
      });
    }

    if (invitation.status === "REVOKED") {
      return jsonResponse(400, {
        ok: false,
        error: "Esta invitación fue cancelada por el club. Solicita una nueva invitación.",
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabaseAdmin
        .from("coach_student_invitations")
        .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return jsonResponse(400, {
        ok: false,
        error: "La invitación ha expirado. Solicita a tu club que te reenvíe la invitación.",
      });
    }

    if (invitation.attempts_count >= 5) {
      await supabaseAdmin
        .from("coach_student_invitations")
        .update({ status: "REVOKED", updated_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return jsonResponse(400, {
        ok: false,
        error: "Demasiados intentos fallidos. Por seguridad, la invitación fue bloqueada. Solicita una nueva.",
      });
    }

    // 3. Comprobar que la sesión autenticada coincide con el correo invitado
    const callerEmail = (caller.email || "").toLowerCase().trim();
    const invitationEmail = (invitation.email || "").toLowerCase().trim();

    if (callerEmail !== invitationEmail) {
      return jsonResponse(403, {
        ok: false,
        error: `La cuenta autenticada (${callerEmail}) no coincide con el correo de la invitación (${invitationEmail}).`,
      });
    }

    // 4. Comprobar datos de jugador
    const { data: jugador } = await supabaseAdmin
      .from("riviera_jugadores")
      .select("id, nombre, email")
      .eq("id", invitation.jugador_id)
      .maybeSingle();

    if (!jugador) {
      return jsonResponse(404, {
        ok: false,
        error: "Perfil deportivo del alumno no encontrado.",
      });
    }

    const { data: idRow } = await supabaseAdmin
      .from("riviera_official_player_identity")
      .select("riviera_id")
      .eq("canonical_riviera_jugador_id", jugador.id)
      .maybeSingle();

    const officialRivieraId = idRow?.riviera_id || null;

    // 5. Validar política de contraseñas si se proporciona
    if (password) {
      const pwdValidation = validatePasswordPolicy(password);
      if (!pwdValidation.valid) {
        await supabaseAdmin
          .from("coach_student_invitations")
          .update({
            attempts_count: (invitation.attempts_count || 0) + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", invitation.id);

        return jsonResponse(400, {
          ok: false,
          error: pwdValidation.message,
        });
      }

      // Actualizar contraseña mediante sesión autenticada
      const { error: updateAuthErr } =
        await supabaseAdmin.auth.admin.updateUserById(caller.id, {
          password: password,
          app_metadata: {
            role: "student",
            account_type: "STUDENT_ONLY",
            roles: ["student"],
          },
          user_metadata: {
            name: jugador.nombre,
            account_type: "STUDENT_ONLY",
          },
        });

      if (updateAuthErr) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "update_user_password_failed",
          detail: updateAuthErr.message,
        });
        return jsonResponse(500, {
          ok: false,
          error: "No se pudo actualizar la contraseña de la cuenta.",
        });
      }
    }

    // 6. Sincronizar en public.users
    await supabaseAdmin.from("users").upsert(
      {
        id: caller.id,
        email: callerEmail,
        name: jugador.nombre,
      },
      { onConflict: "id" }
    );

    // 7. Crear vínculo multiclub en coach_student_account_links
    const { error: linkError } = await supabaseAdmin
      .from("coach_student_account_links")
      .upsert(
        {
          organizador_id: invitation.organizador_id,
          jugador_id: invitation.jugador_id,
          auth_user_id: caller.id,
          verification_method: "STUDENT_AUTH_VERIFIED",
          is_active: true,
          student_email: callerEmail,
          deactivated_at: null,
          deactivated_by: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organizador_id,jugador_id" }
      );

    if (linkError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "account_link_upsert_failed",
        detail: internalErrorDetail(linkError),
      });
      return jsonResponse(500, {
        ok: false,
        error: "No se pudo vincular el perfil deportivo al club.",
      });
    }

    // 8. Marcar invitación como aceptada
    await supabaseAdmin
      .from("coach_student_invitations")
      .update({
        status: "ACCEPTED",
        accepted_at: new Date().toISOString(),
        accepted_by: caller.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    return jsonResponse(200, {
      ok: true,
      email: callerEmail,
      studentName: jugador.nombre,
      rivieraId: officialRivieraId,
      message: "¡Cuenta activada y vinculada exitosamente a Riviera Coaching!",
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
