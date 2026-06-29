import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type AccountRole = "organizador" | "admin_maestro";

interface RequestBody {
  email?: string;
  name?: string;
  password?: string;
  role?: AccountRole;
}

/** Mismo patrón que enviar-notificaciones y procesar-notificaciones-evento. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapAuthCreateError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already been registered") || lower.includes("already exists")) {
    return "Ya existe una cuenta con ese correo electrónico.";
  }
  if (lower.includes("password")) {
    return "La contraseña no cumple los requisitos mínimos de seguridad.";
  }
  return "No se pudo crear la cuenta de acceso.";
}

async function rollbackAuthUser(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  return !error;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, {
      ok: false,
      error: "Sesión de administrador requerida",
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Cuerpo de solicitud inválido" });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  const role: AccountRole =
    body.role === "admin_maestro" ? "admin_maestro" : "organizador";

  if (!email || !isValidEmail(email)) {
    return jsonResponse(400, {
      ok: false,
      error: "Correo electrónico inválido",
    });
  }

  if (!name) {
    return jsonResponse(400, {
      ok: false,
      error: "El nombre es obligatorio",
    });
  }

  if (password.length < 8) {
    return jsonResponse(400, {
      ok: false,
      error: "La contraseña debe tener al menos 8 caracteres",
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
      error: "Sesión de administrador inválida o expirada",
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: adminRow, error: adminLookupError } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (adminLookupError) {
    return jsonResponse(500, {
      ok: false,
      error: "No se pudo verificar permisos de administrador",
    });
  }

  if (!adminRow) {
    return jsonResponse(403, {
      ok: false,
      error: "No tienes permisos de administrador maestro",
    });
  }

  const { data: createdAuth, error: createAuthError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

  if (createAuthError || !createdAuth.user) {
    return jsonResponse(400, {
      ok: false,
      error: mapAuthCreateError(createAuthError?.message ?? ""),
    });
  }

  const newUserId = createdAuth.user.id;

  const { error: profileError } = await supabaseAdmin.from("users").insert({
    id: newUserId,
    email,
    name,
  });

  if (profileError) {
    const rolledBack = await rollbackAuthUser(supabaseAdmin, newUserId);
    if (!rolledBack) {
      return jsonResponse(500, {
        ok: false,
        error:
          "Se creó la cuenta de acceso pero falló el perfil y no se pudo revertir automáticamente. Revisa en Supabase Auth si quedó un usuario huérfano con ese correo.",
        user_id: newUserId,
        email,
      });
    }
    return jsonResponse(500, {
      ok: false,
      error: "No se pudo crear el perfil del usuario",
    });
  }

  if (role === "admin_maestro") {
    const { error: adminInsertError } = await supabaseAdmin
      .from("admin_users")
      .insert({
        user_id: newUserId,
        email,
      });

    if (adminInsertError) {
      const rolledBack = await rollbackAuthUser(supabaseAdmin, newUserId);
      if (!rolledBack) {
        return jsonResponse(500, {
          ok: false,
          error:
            "Se creó el usuario pero falló al asignar permisos de administrador y no se pudo revertir automáticamente. Revisa manualmente en Auth y en public.users.",
          user_id: newUserId,
          email,
        });
      }
      return jsonResponse(500, {
        ok: false,
        error: "No se pudo asignar el rol de administrador maestro",
      });
    }
  }

  return jsonResponse(200, {
    ok: true,
    user_id: newUserId,
    email,
    role,
  });
});
