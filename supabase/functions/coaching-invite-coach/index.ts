import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
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

interface RequestBody {
  action?: string;
  coachId?: string;
  password?: string;
  email?: string;
  nombre?: string;
  telefono?: string;
  paisCodigo?: string | null;
  genero?: string;
  categoria?: string;
  edad?: number | null;
  manoDominante?: string | null;
  enCancha?: string | null;
  fuerzas?: string[];
  especialidades?: string[];
  bio?: string | null;
  organizadorId?: string;
}

const MAX_BODY_BYTES = 12_000;
const MODULE = "coaching-invite-coach";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = readPublishableCredential();
const secretKey = readSecretCredential();
logCredentialSelection({ module: MODULE, secret: secretKey, publishable: publishableKey });

if (!SUPABASE_URL) {
  throw new Error("Missing Supabase env vars.");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordIsUsable(password: string): boolean {
  return password.length >= 8 && password.length <= 72;
}

function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + numbers + symbols;

  const cryptoArr = new Uint8Array(16);
  crypto.getRandomValues(cryptoArr);

  const pwdChars = [
    upper[cryptoArr[0] % upper.length],
    upper[cryptoArr[1] % upper.length],
    lower[cryptoArr[2] % lower.length],
    lower[cryptoArr[3] % lower.length],
    numbers[cryptoArr[4] % numbers.length],
    numbers[cryptoArr[5] % numbers.length],
    symbols[cryptoArr[6] % symbols.length],
    symbols[cryptoArr[7] % symbols.length],
  ];

  for (let i = 8; i < 16; i++) {
    pwdChars.push(all[cryptoArr[i] % all.length]);
  }

  // Shuffle with Fisher-Yates
  const shuffleBytes = new Uint8Array(pwdChars.length);
  crypto.getRandomValues(shuffleBytes);
  for (let i = pwdChars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    const temp = pwdChars[i];
    pwdChars[i] = pwdChars[j];
    pwdChars[j] = temp;
  }

  return "Riviera!" + pwdChars.join("");
}

async function rollbackNewUser(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    await admin.from("users").delete().eq("id", userId);
  } catch (_) {
    // Ignore users cleanup error
  }
  await admin.auth.admin.deleteUser(userId);
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

  const requestedPassword = (body.password ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const nombre = (body.nombre ?? "").trim();
  const fuerzas = Array.isArray(body.fuerzas) ? body.fuerzas : [];
  const especialidades = Array.isArray(body.especialidades)
    ? body.especialidades
    : [];
  const bio = (body.bio ?? "").trim() || null;

  if (!email || !isValidEmail(email)) {
    return jsonResponse(400, {
      ok: false,
      error: "Correo electrónico inválido",
    });
  }

  if (!nombre) {
    return jsonResponse(400, {
      ok: false,
      error: "El nombre del coach es obligatorio",
    });
  }

  // 1. Validar la identidad del caller (organizador del club)
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
      error: "Sesión de organizador inválida o expirada",
    });
  }

  const supabaseAdmin = createCredentialClient(SUPABASE_URL, secretKey);

  // 2. Rate limit por organizador autenticado (10 llamadas por 10 min)
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${caller.id}`, 10, 600);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: caller.id });
    return rateLimitedResponse(rl, cors);
  }

  // 3. Validar autorización del caller:
  // Administrador Maestro (en admin_users) O un organizador de club con registro activo y coaching_enabled === true
  const { data: adminRow, error: adminLookupError } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (adminLookupError) {
    logError({
      correlationId,
      module: MODULE,
      errorType: "admin_lookup_failed",
      detail: internalErrorDetail(adminLookupError),
    });
    return jsonResponse(500, { ok: false, error: safeClientMessage(correlationId) });
  }

  const isMasterAdmin = Boolean(adminRow);
  let clubOrganizadorId = caller.id;

  if (isMasterAdmin && body.organizadorId?.trim()) {
    clubOrganizadorId = body.organizadorId.trim();
  }

  if (!isMasterAdmin) {
    // Si no es admin maestro, debe ser un organizador con registro activo y coaching_enabled === true expresamente
    const { data: modeRow, error: modeError } = await supabaseAdmin
      .from("organizador_game_modes")
      .select("coaching_enabled")
      .eq("organizador_id", caller.id)
      .maybeSingle();

    if (modeError || !modeRow || modeRow.coaching_enabled !== true) {
      logWarn({
        correlationId,
        module: MODULE,
        event: "forbidden_organizer",
        actorId: caller.id,
        reason: modeError ? "query_error" : !modeRow ? "no_organizer_row" : "coaching_disabled",
      });
      return jsonResponse(403, {
        ok: false,
        error: "No tienes permisos de organizador de club con Riviera Coaching habilitado.",
      });
    }
  }

  if (body.action === "reset_password") {
    const coachId = (body.coachId ?? "").trim();
    if (!coachId || !passwordIsUsable(requestedPassword)) {
      return jsonResponse(400, {
        ok: false,
        error: "Indica el coach y una contraseña de al menos 8 caracteres.",
      });
    }

    const { data: membership, error: membershipLookupError } = await supabaseAdmin
      .from("coach_club_memberships")
      .select("id, status")
      .eq("coach_id", coachId)
      .eq("organizador_id", caller.id)
      .maybeSingle();

    if (membershipLookupError || !membership) {
      return jsonResponse(403, {
        ok: false,
        error: "Ese coach no pertenece a tu club.",
      });
    }

    if (membership.status === "REMOVED" || membership.status === "ARCHIVED") {
      return jsonResponse(409, {
        ok: false,
        error: "Este coach ya no está en tu club.",
      });
    }

    const { data: coachRow } = await supabaseAdmin
      .from("riviera_coaches")
      .select("auth_user_id")
      .eq("id", coachId)
      .maybeSingle();

    if (!coachRow?.auth_user_id) {
      return jsonResponse(409, {
        ok: false,
        error: "El coach todavía no tiene credenciales.",
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      coachRow.auth_user_id,
      { password: requestedPassword }
    );

    if (updateError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "password_reset_failed",
        detail: updateError.message,
      });
      return jsonResponse(500, {
        ok: false,
        error: "No se pudo restablecer la contraseña.",
      });
    }

    await supabaseAdmin.from("coach_club_membership_audit_log").insert({
      membership_id: membership.id,
      coach_id: coachId,
      organizador_id: caller.id,
      action: "RESET_PASSWORD",
      performed_by: caller.id,
      previous_status: membership.status,
      new_status: membership.status,
      details: { credential_reset: true },
    });

    return jsonResponse(200, {
      ok: true,
      message: "Contraseña actualizada. El coach entra con la nueva clave.",
    });
  }

  try {
    // 3.1. Pre-flight check: Verificar que la base de datos admite la membresía del coach
    const { error: preflightError } = await supabaseAdmin
      .from("coach_club_memberships")
      .select("id, status, invited_at")
      .limit(0);

    if (preflightError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "missing_0064_migration",
        detail: `Pre-flight check failed: ${preflightError.message}. Migration 0064 is required.`,
      });
      return jsonResponse(500, {
        ok: false,
        error:
          "La base de datos de Coaching no está lista para registrar coaches. Operación detenida.",
      });
    }

    // 4. Revisar si ya existe una cuenta con este correo en public.users
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, email, name")
      .eq("email", email)
      .maybeSingle();

    let targetUserId = "";
    let isNewUser = false;
    let initialPassword: string | null = null;
    const verificationUrl: string | null = null;

    if (existingUser?.id) {
      targetUserId = existingUser.id;
      isNewUser = false;
    } else {
      if (!passwordIsUsable(requestedPassword)) {
        return jsonResponse(400, {
          ok: false,
          error: "Define una contraseña inicial de al menos 8 caracteres.",
        });
      }
      const generatedPassword = requestedPassword;

      const { data: createData, error: initialCreateError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: generatedPassword,
          email_confirm: true,
          app_metadata: {
            role: "coach",
            account_type: "COACH_ONLY",
            roles: ["coach"],
          },
          user_metadata: {
            name: nombre,
            account_type: "COACH_ONLY",
          },
        });

      let createError = initialCreateError;
      if (
        createError &&
        (createError.message?.toLowerCase().includes("already") ||
          createError.message?.toLowerCase().includes("registered") ||
          createError.message?.toLowerCase().includes("exists"))
      ) {
        // En caso de cuenta ya registrada previamente en auth.users, recuperar el usuario existente sin alterar sus credenciales
        const { data: authLookup } = await supabaseAdmin.auth.admin.listUsers();
        const foundUser = (authLookup?.users ?? []).find(
          (u) => u.email?.trim().toLowerCase() === email
        );
        if (foundUser?.id) {
          targetUserId = foundUser.id;
          isNewUser = false;
          createError = null;
          initialPassword = null;
        }
      }

      if (createError || (!targetUserId && !createData?.user)) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "auth_user_create_failed",
          detail: createError?.message ?? "Desconocido",
        });
        return jsonResponse(400, {
          ok: false,
          error:
            "No se pudo crear la cuenta de acceso del coach: " +
            (createError?.message ||
              "error en el servicio de autenticación"),
        });
      }

      if (!targetUserId && createData?.user) {
        targetUserId = createData.user.id;
        isNewUser = true;
        initialPassword = null;
      }

      // Sincronizar o crear fila en public.users de forma idempotente
      const { error: profileError } = await supabaseAdmin.from("users").upsert(
        {
          id: targetUserId,
          email,
          name: nombre,
        },
        { onConflict: "id" }
      );

      if (profileError) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "user_profile_insert_failed",
          detail: internalErrorDetail(profileError),
        });
        if (isNewUser) {
          await rollbackNewUser(supabaseAdmin, targetUserId);
        }
        return jsonResponse(500, {
          ok: false,
          error: "No se pudo crear el perfil de usuario del coach.",
        });
      }
    }

    if (!isNewUser && passwordIsUsable(requestedPassword)) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { password: requestedPassword }
      );
      if (passwordError) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "existing_user_password_failed",
          detail: passwordError.message,
        });
        return jsonResponse(500, {
          ok: false,
          error: "No se pudo asignar la contraseña de acceso.",
        });
      }
    }

    // 6. Verificar o insertar perfil en public.riviera_coaches (identidad única)
    let coachRecord: {
      id: string;
      coach_code: string;
      nombre: string;
      foto_url: string | null;
      bio: string | null;
      especialidades: string[];
      fuerzas: string[];
    };

    const { data: existingCoach } = await supabaseAdmin
      .from("riviera_coaches")
      .select("id, coach_code, nombre, foto_url, bio, especialidades, fuerzas")
      .eq("auth_user_id", targetUserId)
      .maybeSingle();

    if (existingCoach) {
      coachRecord = {
        id: String(existingCoach.id),
        coach_code: String(existingCoach.coach_code),
        nombre: String(existingCoach.nombre),
        foto_url: (existingCoach.foto_url as string | null) ?? null,
        bio: (existingCoach.bio as string | null) ?? null,
        especialidades: Array.isArray(existingCoach.especialidades)
          ? existingCoach.especialidades
          : [],
        fuerzas: Array.isArray(existingCoach.fuerzas)
          ? existingCoach.fuerzas
          : [],
      };
    } else {
      const { data: newCoach, error: coachInsertError } = await supabaseAdmin
        .from("riviera_coaches")
        .insert({
          auth_user_id: targetUserId,
          nombre,
          bio,
          especialidades,
          fuerzas,
        })
        .select("id, coach_code, nombre, foto_url, bio, especialidades, fuerzas")
        .single();

      if (coachInsertError || !newCoach) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "coach_insert_failed",
          detail: internalErrorDetail(coachInsertError),
        });
        if (isNewUser) {
          await rollbackNewUser(supabaseAdmin, targetUserId);
        }
        return jsonResponse(500, {
          ok: false,
          error: safeClientMessage(correlationId),
        });
      }

      coachRecord = {
        id: String(newCoach.id),
        coach_code: String(newCoach.coach_code),
        nombre: String(newCoach.nombre),
        foto_url: (newCoach.foto_url as string | null) ?? null,
        bio: (newCoach.bio as string | null) ?? null,
        especialidades: Array.isArray(newCoach.especialidades)
          ? newCoach.especialidades
          : [],
        fuerzas: Array.isArray(newCoach.fuerzas) ? newCoach.fuerzas : [],
      };
    }

    // 7. Verificar si ya existe membresía previa para este coach en este club
    const { data: existingMembership, error: membershipLookupError } = await supabaseAdmin
      .from("coach_club_memberships")
      .select("id, status")
      .eq("coach_id", coachRecord.id)
      .eq("organizador_id", clubOrganizadorId)
      .maybeSingle();

    if (membershipLookupError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "membership_lookup_failed",
        detail: internalErrorDetail(membershipLookupError),
      });
      return jsonResponse(500, {
        ok: false,
        error: safeClientMessage(correlationId),
      });
    }

    // Si ya es miembro ACTIVE en este club, devolver su estado actual sin duplicar ni reiniciar
    if (existingMembership?.status === "ACTIVE") {
      return jsonResponse(200, {
        ok: true,
        alreadyMember: true,
        coach: coachRecord,
        coachCode: coachRecord.coach_code,
        isNewUser: false,
        membershipStatus: "ACTIVE",
        message: `El coach ${coachRecord.nombre} ya es miembro activo de tu club.`,
      });
    }

    const previousStatus = existingMembership?.status ?? null;

    // 8. El club habilita el acceso de inmediato. No hay aceptación del coach.
    const { data: membershipRow, error: membershipError } = await supabaseAdmin
      .from("coach_club_memberships")
      .upsert(
        {
          coach_id: coachRecord.id,
          organizador_id: clubOrganizadorId,
          status: "ACTIVE",
          invited_by: caller.id,
          invited_at: new Date().toISOString(),
          activated_at: new Date().toISOString(),
          deactivated_at: null,
          cancelled_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "coach_id,organizador_id" }
      )
      .select("id")
      .single();

    if (membershipError) {
      // Si la base de datos no tiene aplicada la migración 0064, fallar de forma controlada
      if (
        membershipError.code === "23514" ||
        membershipError.message?.toLowerCase().includes("check constraint") ||
        membershipError.message?.toLowerCase().includes("coach_club_memberships_status_check")
      ) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "missing_0064_migration",
          detail:
            "Database check constraint does not support PENDING. Migration 0064 is required.",
        });
        return jsonResponse(500, {
          ok: false,
        error:
          "La base de datos de Coaching no admite el alta del coach. Operación detenida.",
        });
      }

      logError({
        correlationId,
        module: MODULE,
        errorType: "membership_upsert_failed",
        detail: internalErrorDetail(membershipError),
      });
      return jsonResponse(500, {
        ok: false,
        error: "No se pudo habilitar el acceso del coach en tu club.",
      });
    }

    if (membershipRow?.id) {
      await supabaseAdmin.from("coach_club_membership_audit_log").insert({
        membership_id: membershipRow.id,
        coach_id: coachRecord.id,
        organizador_id: clubOrganizadorId,
        action: previousStatus ? "CLUB_ACTIVATE" : "CLUB_REGISTER",
        performed_by: caller.id,
        previous_status: previousStatus,
        new_status: "ACTIVE",
        details: { access: "club_controlled" },
      });
    }

    return jsonResponse(200, {
      ok: true,
      alreadyMember: false,
      coach: coachRecord,
      coachCode: coachRecord.coach_code,
      isNewUser,
      initialPassword: null,
      verificationUrl,
      membershipStatus: "ACTIVE",
      message: `Coach ${coachRecord.nombre} activo en tu club. Código ${coachRecord.coach_code}. Entra con el correo y la contraseña que definiste.`,
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

