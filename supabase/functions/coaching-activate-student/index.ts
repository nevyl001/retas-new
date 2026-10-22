import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { newCorrelationId, logError, logWarn } from "../_shared/logger.ts";
import { safeClientMessage, internalErrorDetail } from "../_shared/errors.ts";
import { checkRateLimit, rateLimitedResponse } from "../_shared/rateLimit.ts";

interface RequestBody {
  action?: "resolve_session" | "claim";
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

  // =========================================================================
  // REGLA FUNDAMENTAL DE SEGURIDAD:
  // UNA SOLA ACTIVACIÓN DE CONTRASEÑA MEDIANTE GOTRUE CLIENTE.
  // Toda definición de contraseña se realiza mediante supabase.auth.updateUser({ password }).
  // Este endpoint NUNCA modifica contraseñas anónimamente.
  // =========================================================================
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

  // =========================================================================
  // FLUJO 1: RESOLUCIÓN / RECUPERACIÓN SEGURA DE SESIÓN DEL ALUMNO
  // Si el alumno llega con correo verificado pero sin sesión en el navegador,
  // validar token e inicializar la sesión GoTrue legítima para permitir updateUser.
  // =========================================================================
  if (body.action === "resolve_session") {
    try {
      const tokenHash = await sha256Hex(token);

      const { data: inv, error: invErr } = await supabaseAdmin
        .from("coach_student_invitations")
        .select(
          "id, organizador_id, coach_id, jugador_id, email, token_hash, invitation_token, auth_user_id, status, expires_at, attempts_count"
        )
        .or(`token_hash.eq.${tokenHash},invitation_token.eq.${token}`)
        .limit(1)
        .maybeSingle();

      if (invErr || !inv) {
        return jsonResponse(404, {
          ok: false,
          error: "Invitación no encontrada o token inválido.",
        });
      }

      if (inv.status === "ACCEPTED") {
        return jsonResponse(400, {
          ok: false,
          isAlreadyAccepted: true,
          error:
            "Esta invitación ya fue activada previamente. Inicia sesión con tu correo o Riviera ID.",
        });
      }

      if (inv.status === "REVOKED") {
        return jsonResponse(400, {
          ok: false,
          error:
            "Esta invitación fue cancelada por el club. Solicita una nueva invitación.",
        });
      }

      if (new Date(inv.expires_at) < new Date()) {
        return jsonResponse(400, {
          ok: false,
          error:
            "Esta invitación ha expirado. Solicita a tu club una nueva invitación.",
        });
      }

      if (Number(inv.attempts_count ?? 0) >= 10) {
        return jsonResponse(429, {
          ok: false,
          error:
            "Demasiados intentos fallidos. Por seguridad, la invitación fue bloqueada.",
        });
      }

      // Rate limit por invitación contra fuerza bruta
      const rl = await checkRateLimit(
        supabaseAdmin,
        `${MODULE}:resolve:${inv.id}`,
        15,
        600
      );
      if (!rl.allowed) {
        logWarn({
          correlationId,
          module: MODULE,
          event: "rate_limited_resolve",
          invitationId: inv.id,
        });
        return rateLimitedResponse(rl, cors);
      }

      // Validar identidad del usuario en auth.users
      let authUser: any = null;
      if (inv.auth_user_id) {
        const { data: uData } = await supabaseAdmin.auth.admin.getUserById(
          inv.auth_user_id
        );
        authUser = uData?.user;
      }

      if (!authUser && inv.email) {
        const { data: uList } = await supabaseAdmin.auth.admin.listUsers();
        authUser = uList?.users?.find(
          (u) => u.email?.toLowerCase() === inv.email.toLowerCase()
        );
      }

      if (!authUser) {
        return jsonResponse(404, {
          ok: false,
          error:
            "No se encontró la cuenta de autenticación asociada a esta invitación.",
        });
      }

      // Comprobar estrictamente posesión de correo
      if (!authUser.email_confirmed_at) {
        return jsonResponse(400, {
          ok: false,
          needsEmailVerification: true,
          error:
            "El correo electrónico no ha sido verificado aún. Por favor abre el enlace enviado a tu correo antes de continuar.",
        });
      }

      // Blindaje contra privilegios administrativos o de entrenador
      const appMeta = (authUser.app_metadata as Record<string, any>) || {};
      const userMeta = (authUser.user_metadata as Record<string, any>) || {};
      const accountType = appMeta.account_type || userMeta.account_type;
      const role = appMeta.role || userMeta.role;
      const roles: string[] = Array.isArray(appMeta.roles) ? appMeta.roles : [];

      const isPrivileged =
        accountType === "CLUB_ADMIN" ||
        accountType === "COACH_ONLY" ||
        role === "admin" ||
        role === "coach" ||
        roles.includes("admin") ||
        roles.includes("coach");

      if (isPrivileged) {
        return jsonResponse(403, {
          ok: false,
          error:
            "Esta cuenta pertenece a un organizador o entrenador. No puede activarse como acceso de alumno.",
        });
      }

      // Generar sesión oficial GoTrue para el alumno verificado
      const siteUrl = "https://appriviera.rivieraopen.com";
      const { data: linkData, error: linkErr } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: inv.email,
          options: {
            redirectTo: `${siteUrl}/coaching/acceso-alumno?token=${token}`,
          },
        });

      if (linkErr || !linkData?.properties) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "generate_magiclink_failed",
          detail: internalErrorDetail(linkErr),
        });
        return jsonResponse(500, {
          ok: false,
          error: "No se pudo inicializar la sesión oficial de acceso para el alumno.",
        });
      }

      const actionLink = linkData.properties.action_link;
      let sessionPayload: { access_token: string; refresh_token: string } | null =
        null;

      if (actionLink) {
        try {
          const verifyRes = await fetch(actionLink, {
            method: "GET",
            redirect: "manual",
          });
          const redirectLoc = verifyRes.headers.get("location");
          if (redirectLoc) {
            const hashPart = redirectLoc.split("#")[1] || "";
            const hashParams = new URLSearchParams(hashPart);
            const at = hashParams.get("access_token");
            const rt = hashParams.get("refresh_token");
            if (at) {
              sessionPayload = {
                access_token: at,
                refresh_token: rt || "",
              };
            }
          }
        } catch (fetchErr) {
          logWarn({
            correlationId,
            module: MODULE,
            event: "action_link_exchange_fallback",
            detail: String(fetchErr),
          });
        }
      }

      return jsonResponse(200, {
        ok: true,
        email: inv.email,
        studentName: authUser.user_metadata?.name || "",
        session: sessionPayload,
        tokenHash: linkData.properties.hashed_token || null,
        message: "Sesión del alumno resuelta exitosamente.",
      });
    } catch (err) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "resolve_session_exception",
        detail: err instanceof Error ? err.stack ?? err.message : String(err),
      });
      return jsonResponse(500, {
        ok: false,
        error: safeClientMessage(correlationId),
      });
    }
  }

  // =========================================================================
  // FLUJO 2: VINCULACIÓN CON SESIÓN AUTENTICADA (claim_student_invitation)
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
      error:
        "Sesión de alumno inválida o expirada. Por favor abre el enlace enviado a tu correo.",
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

  // Rate limiting por usuario contra abusos
  const rl = await checkRateLimit(
    supabaseAdmin,
    `${MODULE}:${caller.id}`,
    10,
    600
  );
  if (!rl.allowed) {
    logWarn({
      correlationId,
      module: MODULE,
      event: "rate_limited",
      actorId: caller.id,
    });
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
      message:
        claimData.message ||
        "¡Cuenta activada y vinculada exitosamente a Riviera Coaching!",
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
