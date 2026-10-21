import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { newCorrelationId, logError, logWarn } from "../_shared/logger.ts";
import { safeClientMessage, internalErrorDetail } from "../_shared/errors.ts";
import { checkRateLimit, rateLimitedResponse } from "../_shared/rateLimit.ts";
import { sendByResend, resendApiKeyConfigured } from "../_shared/resendEmail.ts";

interface RequestBody {
  organizadorId?: string;
  jugadorId?: string;
  email?: string;
}

const MAX_BODY_BYTES = 10_000;
const MODULE = "coaching-invite-student";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, {
      ok: false,
      error: "Sesión de organizador requerida",
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Cuerpo de solicitud inválido" });
  }

  const organizadorId = (body.organizadorId ?? "").trim();
  const jugadorId = (body.jugadorId ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();

  if (!organizadorId || !jugadorId) {
    return jsonResponse(400, {
      ok: false,
      error: "Los campos organizadorId y jugadorId son obligatorios",
    });
  }

  if (!email || !isValidEmail(email)) {
    return jsonResponse(400, {
      ok: false,
      error: "Correo electrónico inválido",
    });
  }

  // 1. Validar identidad del caller
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
      error: "Sesión de organizador inválida o expirada",
    });
  }

  // Blindaje: Cuentas STUDENT_ONLY nunca pueden invitar ni administrar accesos
  const appMeta = (caller.app_metadata as Record<string, any>) || {};
  const userMeta = (caller.user_metadata as Record<string, any>) || {};
  if (
    appMeta.account_type === "STUDENT_ONLY" ||
    userMeta.account_type === "STUDENT_ONLY"
  ) {
    return jsonResponse(403, {
      ok: false,
      error: "Las cuentas de alumno tienen restringida la administración de accesos.",
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 2. Rate limit por organizador (20 invitaciones por 10 min)
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${caller.id}`, 20, 600);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: caller.id });
    return rateLimitedResponse(rl, cors);
  }

  // 3. Validar autorización del organizador
  const { data: adminRow } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", caller.id)
    .maybeSingle();

  const isMasterAdmin = Boolean(adminRow);

  if (!isMasterAdmin && caller.id !== organizadorId) {
    return jsonResponse(403, {
      ok: false,
      error: "No tienes permiso para gestionar invitaciones en este club",
    });
  }

  if (!isMasterAdmin) {
    const { data: modeRow, error: modeError } = await supabaseAdmin
      .from("organizador_game_modes")
      .select("coaching_enabled")
      .eq("organizador_id", organizadorId)
      .maybeSingle();

    if (modeError || !modeRow || modeRow.coaching_enabled !== true) {
      return jsonResponse(403, {
        ok: false,
        error: "El club no tiene habilitado el módulo Riviera Coaching.",
      });
    }
  }

  try {
    // 4. Validar alumno y relación en el club
    const { data: jugador, error: jugadorError } = await supabaseAdmin
      .from("riviera_jugadores")
      .select("id, nombre, email")
      .eq("id", jugadorId)
      .maybeSingle();

    if (jugadorError || !jugador) {
      return jsonResponse(404, {
        ok: false,
        error: "Alumno no encontrado en el sistema",
      });
    }

    const { data: relRow, error: relError } = await supabaseAdmin
      .from("coach_player_relationships")
      .select("id, coach_id, status")
      .eq("organizador_id", organizadorId)
      .eq("jugador_id", jugadorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (relError || !relRow) {
      return jsonResponse(400, {
        ok: false,
        error: "El alumno no tiene una relación deportiva registrada en este club.",
      });
    }

    // Obtener nombres para emails y vistas
    const { data: orgUser } = await supabaseAdmin
      .from("users")
      .select("name")
      .eq("id", organizadorId)
      .maybeSingle();
    const clubName = orgUser?.name || "Riviera Coaching";

    const { data: coachRow } = await supabaseAdmin
      .from("riviera_coaches")
      .select("nombre")
      .eq("id", relRow.coach_id)
      .maybeSingle();
    const coachName = coachRow?.nombre || "Tu Entrenador";

    // 5. Comprobar si ya existe vínculo activo para este club
    const { data: existingLink } = await supabaseAdmin
      .from("coach_student_account_links")
      .select("id, auth_user_id, is_active")
      .eq("organizador_id", organizadorId)
      .eq("jugador_id", jugadorId)
      .maybeSingle();

    if (existingLink?.is_active) {
      return jsonResponse(200, {
        ok: true,
        alreadyActive: true,
        status: "ACTIVE",
        message: "El alumno ya cuenta con un acceso activo a Riviera Coaching en este club.",
      });
    }

    // 6. Obtener Riviera ID oficial
    const { data: idRow } = await supabaseAdmin
      .from("riviera_official_player_identity")
      .select("riviera_id")
      .eq("canonical_riviera_jugador_id", jugadorId)
      .maybeSingle();

    const officialRivieraId = idRow?.riviera_id || null;

    // 7. Comprobar si ya existe una cuenta Auth previa para este correo
    // REGLA FUNDAMENTAL DE SEGURIDAD: Nunca sobrescribir contraseña ni roles de cuentas existentes
    let existingAuthUserId: string | null = null;
    let isExistingAccount = false;

    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingUser?.id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(existingUser.id);
      if (authUser?.user && authUser.user.email_confirmed_at) {
        existingAuthUserId = existingUser.id;
        isExistingAccount = true;
      }
    }

    if (!existingAuthUserId) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 50,
      });
      const match = (authUsers?.users ?? []).find(
        (u) => u.email?.trim().toLowerCase() === email
      );
      if (match?.id && match.email_confirmed_at) {
        existingAuthUserId = match.id;
        isExistingAccount = true;
      }
    }

    // 8. Generar token criptográfico y su hash SHA-256
    const token = generateSecureToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const siteUrl = (
      Deno.env.get("SITE_URL") ||
      Deno.env.get("PUBLIC_SITE_URL") ||
      req.headers.get("origin") ||
      "https://appriviera.rivieraopen.com"
    ).replace(/\/$/, "");

    const invitationUrl = `${siteUrl}/coaching/acceso-alumno?token=${token}`;

    let authUserId: string | null = existingAuthUserId;
    let verificationUrl: string | null = null;

    // 9. Si es una cuenta nueva, generar enlace de verificación oficial mediante Supabase Auth
    // Esto crea el usuario en auth.users con email_confirmed_at = null y genera el enlace
    // de confirmación para que la posesión del correo sea obligatoria antes de activar.
    if (!isExistingAccount) {
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email: email,
          options: {
            redirectTo: invitationUrl,
            data: {
              name: jugador.nombre,
              account_type: "STUDENT_ONLY",
            },
          },
        });

      if (linkError) {
        if (
          linkError.message?.toLowerCase().includes("already") ||
          linkError.message?.toLowerCase().includes("exists")
        ) {
          isExistingAccount = true;
        } else {
          logError({
            correlationId,
            module: MODULE,
            errorType: "generate_invite_link_failed",
            detail: internalErrorDetail(linkError),
          });
          return jsonResponse(500, {
            ok: false,
            error: "No se pudo generar el enlace de verificación para el correo.",
          });
        }
      } else if (linkData?.user) {
        authUserId = linkData.user.id;
        verificationUrl = linkData.properties?.action_link || null;

        // Proteger app_metadata con rol exclusivo STUDENT_ONLY
        await supabaseAdmin.auth.admin.updateUserById(linkData.user.id, {
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
      }
    }

    // Revocar invitaciones anteriores pendientes para este club y alumno
    await supabaseAdmin
      .from("coach_student_invitations")
      .update({
        status: "REVOKED",
        revoked_at: new Date().toISOString(),
        revoked_by: caller.id,
        updated_at: new Date().toISOString(),
      })
      .eq("organizador_id", organizadorId)
      .eq("jugador_id", jugadorId)
      .eq("status", "PENDING");

    // Insertar nueva invitación persistiendo solo el token_hash (no texto claro)
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("coach_student_invitations")
      .insert({
        organizador_id: organizadorId,
        coach_id: relRow.coach_id,
        jugador_id: jugadorId,
        email: email,
        token_hash: tokenHash,
        invitation_token: null, // No texto claro
        auth_user_id: authUserId,
        status: "PENDING",
        attempts_count: 0,
        expires_at: expiresAt,
        invited_at: new Date().toISOString(),
        invited_by: caller.id,
      })
      .select("id, email, expires_at")
      .single();

    if (invError || !invitation) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "invitation_insert_failed",
        detail: internalErrorDetail(invError),
      });
      return jsonResponse(500, {
        ok: false,
        error: "No se pudo registrar la invitación para el alumno.",
      });
    }

    // Envío seguro de email obligatorio vía Resend
    if (!resendApiKeyConfigured()) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "resend_not_configured",
        detail: "RESEND_API_KEY no configurada en secrets de Supabase",
      });
      return jsonResponse(500, {
        ok: false,
        error: "El servicio de correo electrónico (Resend) no está configurado en el servidor. No se pudo enviar la invitación al alumno.",
      });
    }

    try {
      if (isExistingAccount) {
        const sendResult = await sendByResend(
          email,
          `Riviera Coaching — Vinculación con ${clubName}`,
          `Hola ${jugador.nombre},\n\nEl club ${clubName} te ha invitado a consultar tus clases con el coach ${coachName} en Riviera Coaching.\n\nPara vincular tu perfil a tu cuenta existente de AppRiviera, ingresa aquí:\n${invitationUrl}`,
          `<div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 14px; color: #0284c7; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">🎾 Riviera Coaching</div>
            <h2 style="color: #0f172a; margin-top: 0;">Vinculación de Perfil Deportivo</h2>
            <p>Hola <strong>${jugador.nombre}</strong>,</p>
            <p><strong>${clubName}</strong> te ha registrado como alumno del coach <strong>${coachName}</strong> en Riviera Coaching con tu identificador oficial <strong>${officialRivieraId || "N/A"}</strong>.</p>
            <p>Ya tienes una cuenta registrada en AppRiviera con este correo. Inicia sesión con tu contraseña habitual para vincular tu perfil de coaching sin modificar tus credenciales:</p>
            <div style="margin: 24px 0;">
              <a href="${invitationUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Vincular Perfil Deportivo</a>
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">Si no solicitaste este acceso, puedes ignorar este correo.</p>
          </div>`,
          { correlationId, module: MODULE, jugadorId }
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
            error: `No se pudo enviar el correo de vinculación al alumno (${sendResult.error || "error del proveedor de correo"}).`,
          });
        }
      } else {
        const directVerifyUrl = verificationUrl || invitationUrl;
        const sendResult = await sendByResend(
          email,
          `Invitación a Riviera Coaching — ${clubName}`,
          `Hola ${jugador.nombre},\n\nEl club ${clubName} te ha registrado como alumno con el coach ${coachName} en Riviera Coaching (Riviera ID: ${officialRivieraId || "N/A"}).\n\nPara verificar la propiedad de tu correo y establecer tu contraseña de acceso, haz clic en el siguiente enlace:\n${directVerifyUrl}`,
          `<div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 14px; color: #0284c7; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">🎾 Riviera Coaching</div>
            <h2 style="color: #0f172a; margin-top: 0;">Verificación de Acceso de Alumno</h2>
            <p>Hola <strong>${jugador.nombre}</strong>,</p>
            <p><strong>${clubName}</strong> te ha registrado como alumno con el coach <strong>${coachName}</strong> en Riviera Coaching con tu identificador oficial <strong>${officialRivieraId || "N/A"}</strong>.</p>
            <p>Por seguridad y para comprobar la posesión de tu correo electrónico, haz clic en el siguiente botón para verificar tu cuenta y definir tu contraseña:</p>
            <div style="margin: 24px 0;">
              <a href="${directVerifyUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Verificar Correo y Activar Cuenta</a>
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${directVerifyUrl}">${directVerifyUrl}</a></p>
          </div>`,
          { correlationId, module: MODULE, jugadorId }
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
            error: `No se pudo enviar el correo de verificación al alumno (${sendResult.error || "error del proveedor de correo"}).`,
          });
        }
      }
    } catch (emailErr) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "resend_exception",
        detail: emailErr instanceof Error ? emailErr.stack ?? emailErr.message : String(emailErr),
      });
      return jsonResponse(502, {
        ok: false,
        error: "Fallo inesperado al enviar el correo de verificación.",
      });
    }

    // Respuesta al club: NUNCA se entregan enlaces de verificación ni tokens de activación
    return jsonResponse(200, {
      ok: true,
      invitationId: invitation.id,
      isExistingAccount,
      email,
      studentName: jugador.nombre,
      rivieraId: officialRivieraId,
      expiresAt: invitation.expires_at,
      message: isExistingAccount
        ? `Invitación enviada al correo ${email} para vincular su cuenta existente.`
        : `Invitación y enlace de verificación enviados al buzón ${email}.`,
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
