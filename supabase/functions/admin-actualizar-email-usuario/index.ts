import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RequestBody {
  target_user_id?: string;
  new_email?: string;
}

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

function mapAuthUpdateError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("already been registered") ||
    lower.includes("already exists") ||
    lower.includes("duplicate")
  ) {
    return "Ya existe otra cuenta con ese correo electrónico.";
  }
  return "No se pudo actualizar el correo de acceso.";
}

async function syncAuthEmailIdentity(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  newEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc(
    "admin_sync_auth_email_identity",
    {
      p_user_id: userId,
      p_new_email: newEmail,
    }
  );

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.includes("admin_sync_auth_email_identity") ||
      error.code === "PGRST202" ||
      error.code === "42883"
    ) {
      return {
        ok: false,
        error:
          "Falta desplegar el SQL admin-sync-auth-email-identity.sql en Supabase.",
      };
    }
    return { ok: false, error: msg || "No se pudo sincronizar el acceso" };
  }

  if (data && typeof data === "object" && (data as { ok?: boolean }).ok === true) {
    return { ok: true };
  }

  return { ok: false, error: "Sincronización de acceso incompleta" };
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

  const targetUserId = (body.target_user_id ?? "").trim();
  const newEmail = (body.new_email ?? "").trim().toLowerCase();

  if (!targetUserId) {
    return jsonResponse(400, { ok: false, error: "Usuario inválido" });
  }

  if (!newEmail || !isValidEmail(newEmail)) {
    return jsonResponse(400, {
      ok: false,
      error: "Correo electrónico inválido",
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

  const { data: authBefore, error: authBeforeError } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);

  if (authBeforeError || !authBefore.user) {
    return jsonResponse(404, {
      ok: false,
      error: "Cuenta de acceso no encontrada en Auth",
    });
  }

  const { data: profile, error: profileLookupError } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileLookupError) {
    return jsonResponse(500, {
      ok: false,
      error: "No se pudo cargar el usuario",
    });
  }

  if (!profile) {
    return jsonResponse(404, {
      ok: false,
      error: "Usuario no encontrado",
    });
  }

  const currentAuthEmail = (authBefore.user.email ?? "").trim().toLowerCase();
  const currentProfileEmail = (profile.email ?? "").trim().toLowerCase();

  if (currentAuthEmail === newEmail && currentProfileEmail === newEmail) {
    const syncOnly = await syncAuthEmailIdentity(
      supabaseAdmin,
      targetUserId,
      newEmail
    );
    if (!syncOnly.ok) {
      return jsonResponse(500, { ok: false, error: syncOnly.error });
    }
    return jsonResponse(200, {
      ok: true,
      user_id: targetUserId,
      email: newEmail,
      unchanged: true,
    });
  }

  const rollbackEmail = currentAuthEmail || currentProfileEmail;

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUserId,
    {
      email: newEmail,
      email_confirm: true,
      role: "authenticated",
    }
  );

  if (authUpdateError) {
    return jsonResponse(400, {
      ok: false,
      error: mapAuthUpdateError(authUpdateError.message ?? ""),
    });
  }

  const syncResult = await syncAuthEmailIdentity(
    supabaseAdmin,
    targetUserId,
    newEmail
  );

  if (!syncResult.ok) {
    if (rollbackEmail) {
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: rollbackEmail,
        email_confirm: true,
        role: "authenticated",
      });
      await syncAuthEmailIdentity(supabaseAdmin, targetUserId, rollbackEmail);
    }
    return jsonResponse(500, { ok: false, error: syncResult.error });
  }

  const { data: authAfter } = await supabaseAdmin.auth.admin.getUserById(
    targetUserId
  );
  const verifiedEmail = (authAfter?.user?.email ?? "").trim().toLowerCase();
  if (verifiedEmail !== newEmail) {
    return jsonResponse(500, {
      ok: false,
      error:
        "El correo no quedó sincronizado en Auth. Revisa admin-sync-auth-email-identity.sql.",
    });
  }

  const { error: profileUpdateError } = await supabaseAdmin
    .from("users")
    .update({ email: newEmail })
    .eq("id", targetUserId);

  if (profileUpdateError) {
    if (rollbackEmail) {
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: rollbackEmail,
        email_confirm: true,
        role: "authenticated",
      });
      await syncAuthEmailIdentity(supabaseAdmin, targetUserId, rollbackEmail);
      await supabaseAdmin
        .from("users")
        .update({ email: rollbackEmail })
        .eq("id", targetUserId);
    }
    return jsonResponse(500, {
      ok: false,
      error:
        "Se actualizó el acceso pero falló el perfil. Se revirtió el correo.",
    });
  }

  const { data: adminTargetRow } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (adminTargetRow) {
    await supabaseAdmin
      .from("admin_users")
      .update({ email: newEmail })
      .eq("user_id", targetUserId);
  }

  return jsonResponse(200, {
    ok: true,
    user_id: targetUserId,
    email: newEmail,
  });
});
