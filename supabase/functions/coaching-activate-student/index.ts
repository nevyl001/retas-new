import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  createCredentialClient,
  logCredentialSelection,
  readPublishableCredential,
  readSecretCredential,
} from "../_shared/supabaseCredentials.ts";
import { newCorrelationId, logError, logWarn } from "../_shared/logger.ts";
import { safeClientMessage, internalErrorDetail } from "../_shared/errors.ts";
import { checkRateLimit, rateLimitedResponse } from "../_shared/rateLimit.ts";
import { sendByResend, resendApiKeyConfigured } from "../_shared/resendEmail.ts";

interface RequestBody {
  action?: "student_login" | "request_password_reset" | "request_student_access_link" | "claim";
  token?: string;
  identifier?: string;
  password?: string;
  redirectTo?: string;
}

const MAX_BODY_BYTES = 10_000;
const MODULE = "coaching-activate-student";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = readPublishableCredential();
const secretKey = readSecretCredential();
logCredentialSelection({ module: MODULE, secret: secretKey, publishable: publishableKey });

if (!SUPABASE_URL) {
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

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "anonymous";

  const supabaseAdmin = createCredentialClient(SUPABASE_URL, secretKey);

  // =========================================================================
  // FLUJO 1: LOGIN SEGURO DE ALUMNO (Correo o Riviera ID)
  // Resuelve el Riviera ID internamente mediante service_role sin exponer correos.
  // Autentica con GoTrue cliente sin privilegios (SUPABASE_ANON_KEY).
  // =========================================================================
  if (body.action === "student_login") {
    const rawIdentifier = (body.identifier ?? "").trim();
    const rawPassword = body.password ?? "";

    if (!rawIdentifier || !rawPassword) {
      return jsonResponse(400, {
        ok: false,
        error: "Ingresa tu identificador (correo o Riviera ID) y tu contraseña.",
      });
    }

    // Rate limiting contra fuerza bruta por IP y por identificador (failClosed: true para seguridad estricta)
    const normalizedIdentifier = rawIdentifier.toLowerCase();
    const ipRl = await checkRateLimit(
      supabaseAdmin,
      `${MODULE}:login:ip:${clientIp}`,
      20,
      600,
      { failClosed: true }
    );
    if (!ipRl.allowed) {
      logWarn({
        correlationId,
        module: MODULE,
        event: "rate_limited_login_ip",
        ip: clientIp,
      });
      return jsonResponse(429, {
        ok: false,
        error: "Demasiados intentos de acceso desde esta conexión. Espera unos minutos antes de intentar de nuevo.",
      });
    }

    const idRl = await checkRateLimit(
      supabaseAdmin,
      `${MODULE}:login:id:${normalizedIdentifier}`,
      8,
      600,
      { failClosed: true }
    );
    if (!idRl.allowed) {
      logWarn({
        correlationId,
        module: MODULE,
        event: "rate_limited_login_identifier",
        identifier: normalizedIdentifier,
      });
      return jsonResponse(429, {
        ok: false,
        error: "Demasiados intentos fallidos con esta cuenta. Espera unos minutos antes de intentar de nuevo.",
      });
    }

    try {
      let emailToAuth = normalizedIdentifier;

      // Si no contiene '@', resolver internamente mediante la RPC protegida
      if (!rawIdentifier.includes("@")) {
        const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
          "resolve_student_login_identifier",
          { p_identifier: rawIdentifier }
        );

        if (rpcErr || !rpcRes || rpcRes.ok !== true || !rpcRes.email) {
          // Error genérico sin revelar si el Riviera ID existe
          return jsonResponse(401, {
            ok: false,
            error: "Credenciales incorrectas. Verifica tu identificador y contraseña.",
          });
        }
        emailToAuth = String(rpcRes.email).trim().toLowerCase();
      }

      // Validar contraseña con cliente GoTrue estándar sin privilegios administrativos
      const supabaseAnonAuth = createCredentialClient(SUPABASE_URL, publishableKey);

      const { data: authData, error: authError } =
        await supabaseAnonAuth.auth.signInWithPassword({
          email: emailToAuth,
          password: rawPassword,
        });

      if (authError || !authData?.session || !authData.user) {
        return jsonResponse(401, {
          ok: false,
          error: "Credenciales incorrectas. Verifica tu identificador y contraseña.",
        });
      }

      // Blindaje de portal: Rechazar cuentas de organizador o entrenador que intenten entrar al portal de alumno
      const appMeta = (authData.user.app_metadata as Record<string, any>) || {};
      const userMeta = (authData.user.user_metadata as Record<string, any>) || {};
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
          error: "Esta cuenta pertenece a un organizador o entrenador. Inicia sesión en el portal correspondiente.",
        });
      }

      return jsonResponse(200, {
        ok: true,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
          token_type: authData.session.token_type,
          user: {
            id: authData.user.id,
            email: authData.user.email,
            user_metadata: authData.user.user_metadata,
            app_metadata: authData.user.app_metadata,
          },
        },
      });
    } catch (loginErr) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "student_login_exception",
        detail: loginErr instanceof Error ? loginErr.stack ?? loginErr.message : String(loginErr),
      });
      return jsonResponse(500, {
        ok: false,
        error: safeClientMessage(correlationId),
      });
    }
  }

  // =========================================================================
  // FLUJO 2: RECUPERACIÓN SEGURA DE CONTRASEÑA (Correo o Riviera ID)
  // No revela correos ni indica si el identificador existe.
  // Envía el enlace de recuperación únicamente al correo registrado del alumno.
  // =========================================================================
  if (body.action === "request_password_reset") {
    const rawIdentifier = (body.identifier ?? "").trim();
    if (!rawIdentifier) {
      return jsonResponse(400, {
        ok: false,
        error: "Ingresa tu correo o Riviera ID registrado.",
      });
    }

    const resetRl = await checkRateLimit(
      supabaseAdmin,
      `${MODULE}:reset:${clientIp}`,
      5,
      600,
      { failClosed: true }
    );
    if (!resetRl.allowed) {
      return jsonResponse(429, {
        ok: false,
        error: "Demasiadas solicitudes de recuperación. Espera unos minutos.",
      });
    }

    try {
      let emailToSend: string | null = null;
      if (rawIdentifier.includes("@")) {
        emailToSend = rawIdentifier.toLowerCase();
      } else {
        const { data: rpcRes } = await supabaseAdmin.rpc(
          "resolve_student_login_identifier",
          { p_identifier: rawIdentifier }
        );
        if (rpcRes?.ok && rpcRes.email) {
          emailToSend = String(rpcRes.email).trim().toLowerCase();
        }
      }

      if (emailToSend) {
        const siteUrl = "https://appriviera.rivieraopen.com";
        const redirectTo = body.redirectTo || `${siteUrl}/auth/reset-password`;
        await supabaseAdmin.auth.resetPasswordForEmail(emailToSend, {
          redirectTo,
        });
      }

      // Respuesta siempre idéntica para evitar enumeración de cuentas
      return jsonResponse(200, {
        ok: true,
        message:
          "Si existe una cuenta de alumno asociada a este identificador, se ha enviado un enlace de recuperación a su correo electrónico registrado.",
      });
    } catch (resetErr) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "password_reset_exception",
        detail: resetErr instanceof Error ? resetErr.stack ?? resetErr.message : String(resetErr),
      });
      return jsonResponse(200, {
        ok: true,
        message:
          "Si existe una cuenta de alumno asociada a este identificador, se ha enviado un enlace de recuperación a su correo electrónico registrado.",
      });
    }
  }

  // =========================================================================
  // FLUJO 3: REENVÍO DE ENLACE DE ACCESO (Cross-device / Verificación de correo)
  // Si el alumno perdió su enlace o está en otro dispositivo, se envía un nuevo
  // enlace oficial a su correo privado. NUNCA se entregan tokens ni sesiones al cliente.
  // =========================================================================
  if (body.action === "request_student_access_link") {
    const token = (body.token ?? "").trim();
    if (!token) {
      return jsonResponse(400, {
        ok: false,
        error: "Token de invitación no proporcionado.",
      });
    }

    try {
      const tokenHash = await sha256Hex(token);
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("coach_student_invitations")
        .select("id, email, status, expires_at, jugador_id")
        .eq("token_hash", tokenHash)
        .limit(1)
        .maybeSingle();

      if (invErr || !inv || inv.status !== "PENDING" || new Date(inv.expires_at) < new Date()) {
        // Respuesta genérica que no revela la existencia ni el estado de cuentas
        return jsonResponse(200, {
          ok: true,
          message:
            "Si la invitación es válida y está activa, se ha enviado un enlace de acceso a tu correo registrado.",
        });
      }

      const linkRl = await checkRateLimit(
        supabaseAdmin,
        `${MODULE}:resend_link:${inv.id}`,
        3,
        600,
        { failClosed: true }
      );
      if (!linkRl.allowed) {
        return jsonResponse(429, {
          ok: false,
          error: "Ya se envió un enlace recientemente. Por favor revisa tu bandeja de entrada o spam.",
        });
      }

      const siteUrl = "https://appriviera.rivieraopen.com";
      const invitationUrl = `${siteUrl}/coaching/acceso-alumno?token=${encodeURIComponent(token)}`;

      let actionLink: string | null = null;
      const { data: inviteData, error: inviteErr } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email: inv.email,
          options: { redirectTo: invitationUrl },
        });

      if (!inviteErr && inviteData?.properties?.action_link) {
        actionLink = inviteData.properties.action_link;
      } else {
        // Si el usuario ya existe en Supabase Auth, GoTrue rechaza "invite"; generamos "magiclink"
        const { data: magicData, error: magicErr } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: inv.email,
            options: { redirectTo: invitationUrl },
          });
        if (!magicErr && magicData?.properties?.action_link) {
          actionLink = magicData.properties.action_link;
        } else {
          logError({
            correlationId,
            module: MODULE,
            errorType: "generate_access_link_failed",
            detail: internalErrorDetail(magicErr || inviteErr),
          });
          return jsonResponse(500, {
            ok: false,
            error: "No se pudo generar el enlace de verificación en el servidor.",
          });
        }
      }

      if (!resendApiKeyConfigured()) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "resend_not_configured",
          detail: "RESEND_API_KEY no configurada",
        });
        return jsonResponse(500, {
          ok: false,
          error: "El servicio de correo electrónico no está configurado.",
        });
      }

      const sendResult = await sendByResend(
        inv.email,
        "Enlace de Verificación y Acceso — Riviera Coaching",
        `Hola,\n\nPara verificar tu correo y acceder a tu cuenta de alumno desde cualquier dispositivo, haz clic en el siguiente enlace:\n${actionLink}`,
        `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #09090b; background: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7;">
          <div style="font-size: 11px; letter-spacing: 0.1em; color: #71717a; font-weight: 700; text-transform: uppercase; margin-bottom: 12px;">Riviera Coaching</div>
          <h2 style="color: #09090b; margin-top: 0; font-size: 20px; font-weight: 700;">Verificación y Acceso de Alumno</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #27272a;">Para verificar tu correo y continuar con la activación de tu cuenta de alumno en este u otro dispositivo, haz clic en el siguiente botón:</p>
          <div style="margin: 28px 0;">
            <a href="${actionLink}" style="background-color: #09090b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">Verificar y Activar Cuenta</a>
          </div>
          <p style="color: #71717a; font-size: 12px; margin-top: 28px; border-top: 1px solid #f4f4f5; padding-top: 16px;">Si no solicitaste este acceso, puedes ignorar este mensaje.</p>
        </div>`,
        { correlationId, module: MODULE, invitationId: inv.id }
      );

      if (!sendResult.ok) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "resend_send_failed",
          detail: sendResult.error || sendResult.responseBody,
        });
        return jsonResponse(502, {
          ok: false,
          error: "No se pudo enviar el correo de verificación. Por favor intenta de nuevo.",
        });
      }

      return jsonResponse(200, {
        ok: true,
        message:
          "Si la invitación es válida y está activa, se ha enviado un enlace de acceso a tu correo registrado.",
      });
    } catch (resendErr) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "request_access_link_exception",
        detail: resendErr instanceof Error ? resendErr.stack ?? resendErr.message : String(resendErr),
      });
      return jsonResponse(500, {
        ok: false,
        error: safeClientMessage(correlationId),
      });
    }
  }

  // =========================================================================
  // REGLA FUNDAMENTAL DE SEGURIDAD:
  // UNA SOLA ACTIVACIÓN DE CONTRASEÑA MEDIANTE GOTRUE CLIENTE.
  // Este endpoint NUNCA modifica contraseñas anónimamente.
  // =========================================================================
  if (body.password !== undefined && body.password !== null && body.password !== "") {
    return jsonResponse(400, {
      ok: false,
      error:
        "La modificación de contraseñas mediante este endpoint ha sido desactivada por seguridad. Toda contraseña debe ser definida directamente mediante supabase.auth.updateUser() con una sesión verificada del alumno.",
    });
  }

  // =========================================================================
  // FLUJO 4: VINCULACIÓN CON SESIÓN AUTENTICADA (claim_student_invitation)
  // El alumno ya debe contar con una sesión verificada en Supabase Auth.
  // =========================================================================
  const token = (body.token ?? "").trim();
  if (!token) {
    return jsonResponse(400, {
      ok: false,
      error: "Token de invitación no proporcionado.",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, {
      ok: false,
      error:
        "Se requiere sesión autenticada del alumno para vincular el acceso. Abre el enlace enviado a tu correo.",
    });
  }

  const supabaseCaller = createCredentialClient(
    SUPABASE_URL,
    publishableKey,
    authHeader,
  );

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

  // Rate limiting por usuario contra abusos (failClosed: true para proteger activación)
  const rl = await checkRateLimit(
    supabaseAdmin,
    `${MODULE}:${caller.id}`,
    10,
    600,
    { failClosed: true }
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
