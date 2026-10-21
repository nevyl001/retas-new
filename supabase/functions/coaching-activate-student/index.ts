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
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

  // 1. Rate limiting por IP o hash contra ataques de fuerza bruta
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${clientIp}`, 15, 600);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: clientIp });
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

    // Comprobación de intentos contra fuerza bruta
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

    // 3. Comprobar datos de jugador
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

    // 4. Comprobar si ya existe cuenta Auth previa con contraseña
    // En tal caso, el usuario debe INICIAR SESIÓN y llamar a claim_student_invitation
    let existingAuthUserId: string | null = invitation.auth_user_id || null;
    let hasExistingPassword = false;

    if (!existingAuthUserId) {
      const { data: userLookup } = await supabaseAdmin
        .from("users")
        .select("id, email")
        .eq("email", invitation.email.toLowerCase())
        .maybeSingle();

      if (userLookup?.id) {
        existingAuthUserId = userLookup.id;
      }
    }

    if (existingAuthUserId) {
      const { data: authUser, error: getUserErr } =
        await supabaseAdmin.auth.admin.getUserById(existingAuthUserId);

      if (!getUserErr && authUser?.user) {
        // Si el usuario ya existe en Auth, no permitir sobrescribir su contraseña desde un enlace sin autenticación previa
        hasExistingPassword = true;
      }
    }

    if (hasExistingPassword) {
      return jsonResponse(400, {
        ok: false,
        isExistingAccount: true,
        error:
          "Ya existe una cuenta en AppRiviera registrada con este correo. Por favor inicia sesión con tu contraseña habitual para vincular tu perfil.",
      });
    }

    // 5. Para nueva cuenta: validar contraseña
    const pwdValidation = validatePasswordPolicy(password);
    if (!pwdValidation.valid) {
      // Incrementar contador de intentos en la invitación
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

    // 6. Crear cuenta en Auth usando Supabase Admin API con rol exclusivo STUDENT_ONLY
    let authUserId: string;

    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: invitation.email.toLowerCase(),
        password: password,
        email_confirm: true,
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

    if (createError || !createData?.user) {
      // Si la cuenta existía pero no fue detectada, actualizarla con seguridad
      if (
        createError?.message?.toLowerCase().includes("already") ||
        createError?.message?.toLowerCase().includes("exists")
      ) {
        return jsonResponse(400, {
          ok: false,
          isExistingAccount: true,
          error:
            "Ya existe una cuenta con este correo. Por favor inicia sesión con tu contraseña para vincular tu perfil.",
        });
      }

      logError({
        correlationId,
        module: MODULE,
        errorType: "auth_user_create_failed",
        detail: createError?.message ?? "Desconocido",
      });

      return jsonResponse(500, {
        ok: false,
        error: "No se pudo crear la cuenta de acceso del alumno.",
      });
    }

    authUserId = createData.user.id;

    // 7. Sincronizar en public.users
    await supabaseAdmin.from("users").upsert(
      {
        id: authUserId,
        email: invitation.email.toLowerCase(),
        name: jugador.nombre,
      },
      { onConflict: "id" }
    );

    // 8. Crear vínculo multiclub en coach_student_account_links
    const { error: linkError } = await supabaseAdmin
      .from("coach_student_account_links")
      .upsert(
        {
          organizador_id: invitation.organizador_id,
          jugador_id: invitation.jugador_id,
          auth_user_id: authUserId,
          verification_method: "INVITATION_LINK",
          is_active: true,
          student_email: invitation.email.toLowerCase(),
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
        error: "No se pudo vincular la cuenta al perfil de coaching del club.",
      });
    }

    // 9. Marcar invitación como ACCEPTED
    await supabaseAdmin
      .from("coach_student_invitations")
      .update({
        status: "ACCEPTED",
        accepted_at: new Date().toISOString(),
        accepted_by: authUserId,
        auth_user_id: authUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    return jsonResponse(200, {
      ok: true,
      email: invitation.email,
      studentName: jugador.nombre,
      rivieraId: officialRivieraId,
      message:
        "¡Cuenta creada y perfil vinculado exitosamente! Ya puedes acceder a Mi Coaching.",
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
