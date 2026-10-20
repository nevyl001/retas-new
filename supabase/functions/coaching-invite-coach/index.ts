import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { newCorrelationId, logError, logWarn } from "../_shared/logger.ts";
import { safeClientMessage, internalErrorDetail } from "../_shared/errors.ts";
import { checkRateLimit, rateLimitedResponse } from "../_shared/rateLimit.ts";

interface RequestBody {
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
}

const MAX_BODY_BYTES = 12_000;
const MODULE = "coaching-invite-coach";

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

function generateSecurePassword(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `Riv-${hex}!`;
}

async function rollbackAuthUser(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  return !error;
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

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 2. Rate limit por organizador autenticado (10 llamadas por 10 min)
  const rl = await checkRateLimit(supabaseAdmin, `${MODULE}:${caller.id}`, 10, 600);
  if (!rl.allowed) {
    logWarn({ correlationId, module: MODULE, event: "rate_limited", actorId: caller.id });
    return rateLimitedResponse(rl, cors);
  }

  try {
    // 3. Revisar si ya existe una cuenta con este correo en public.users
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, email, name")
      .eq("email", email)
      .maybeSingle();

    let targetUserId: string;
    let isNewUser = false;

    if (existingUser?.id) {
      targetUserId = existingUser.id;
    } else {
      // 4. Crear cuenta en auth.users + public.users
      const tempPassword = generateSecurePassword();
      const { data: createdAuth, error: createAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { name: nombre },
        });

      if (createAuthError || !createdAuth.user) {
        logError({
          correlationId,
          module: MODULE,
          errorType: "auth_user_creation_failed",
          detail: createAuthError?.message ?? "Desconocido",
        });
        return jsonResponse(400, {
          ok: false,
          error: "No se pudo crear la cuenta de usuario para el coach.",
        });
      }

      targetUserId = createdAuth.user.id;
      isNewUser = true;

      // Crear fila en public.users
      const { error: profileError } = await supabaseAdmin.from("users").insert({
        id: targetUserId,
        email,
        name: nombre,
      });

      if (profileError) {
        await rollbackAuthUser(supabaseAdmin, targetUserId);
        return jsonResponse(500, {
          ok: false,
          error: "No se pudo crear el perfil de usuario del coach.",
        });
      }
    }

    // 5. Verificar o insertar perfil en public.riviera_coaches
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
          await rollbackAuthUser(supabaseAdmin, targetUserId);
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

    // 6. Asignar o reactivar membresía en coach_club_memberships para el organizador
    const { error: membershipError } = await supabaseAdmin
      .from("coach_club_memberships")
      .upsert(
        {
          coach_id: coachRecord.id,
          organizador_id: caller.id,
          status: "ACTIVE",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "coach_id,organizador_id" }
      );

    if (membershipError) {
      logError({
        correlationId,
        module: MODULE,
        errorType: "membership_upsert_failed",
        detail: internalErrorDetail(membershipError),
      });
      return jsonResponse(500, {
        ok: false,
        error: "No se pudo registrar la membresía del coach en tu club.",
      });
    }

    return jsonResponse(200, {
      ok: true,
      coach: coachRecord,
      coachCode: coachRecord.coach_code,
      isNewUser,
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

