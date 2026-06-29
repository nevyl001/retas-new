import { supabase } from "../supabaseClient";

export type AdminCreateUserRole = "organizador" | "admin_maestro";

export interface AdminCreateUserInput {
  email: string;
  name: string;
  password: string;
  role: AdminCreateUserRole;
}

export interface AdminCreateUserResult {
  user_id: string;
  email: string;
  role: AdminCreateUserRole;
}

interface EdgeResponse {
  ok?: boolean;
  error?: string;
  user_id?: string;
  email?: string;
  role?: AdminCreateUserRole;
}

function readEdgeErrorBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" && err.trim() ? err.trim() : null;
}

function mapInvokeError(message: string, status?: number): string {
  const lower = message.toLowerCase();

  if (status === 404 || lower.includes("not found")) {
    return "La función admin-crear-usuario no está desplegada en Supabase. Ejecuta: supabase functions deploy admin-crear-usuario";
  }

  if (lower.includes("failed to send") || lower.includes("fetch")) {
    return "No se pudo contactar al servidor. Despliega la Edge Function admin-crear-usuario en Supabase (supabase functions deploy admin-crear-usuario) y vuelve a intentar.";
  }

  if (lower.includes("jwt") || lower.includes("session")) {
    return "Tu sesión de administrador expiró. Vuelve a iniciar sesión.";
  }

  return message || "No se pudo crear el usuario";
}

export async function createUserAdmin(
  input: AdminCreateUserInput
): Promise<AdminCreateUserResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "No hay sesión de administrador activa. Cierra sesión y vuelve a entrar en /admin-login."
    );
  }

  const { data, error } = await supabase.functions.invoke("admin-crear-usuario", {
    body: {
      email: input.email.trim(),
      name: input.name.trim(),
      password: input.password,
      role: input.role,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const bodyFromData = readEdgeErrorBody(data);

  if (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "context" in error &&
      typeof (error as { context?: { status?: number } }).context?.status ===
        "number"
        ? (error as { context: { status: number } }).context.status
        : undefined;

    throw new Error(
      bodyFromData ?? mapInvokeError(error.message, status)
    );
  }

  const body = data as EdgeResponse | null;

  if (!body || body.ok !== true || !body.user_id || !body.email) {
    throw new Error(
      bodyFromData ??
        body?.error ??
        "No se pudo crear el usuario. Respuesta inválida del servidor."
    );
  }

  return {
    user_id: body.user_id,
    email: body.email,
    role: body.role === "admin_maestro" ? "admin_maestro" : "organizador",
  };
}
