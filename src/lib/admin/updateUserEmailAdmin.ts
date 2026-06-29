import { supabase } from "../supabaseClient";

export interface AdminUpdateUserEmailInput {
  targetUserId: string;
  newEmail: string;
}

export interface AdminUpdateUserEmailResult {
  user_id: string;
  email: string;
}

interface EdgeResponse {
  ok?: boolean;
  error?: string;
  user_id?: string;
  email?: string;
}

function readEdgeErrorBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" && err.trim() ? err.trim() : null;
}

function mapInvokeError(message: string, status?: number): string {
  const lower = message.toLowerCase();

  if (status === 404 || lower.includes("not found")) {
    return "La función admin-actualizar-email-usuario no está desplegada. Ejecuta: supabase functions deploy admin-actualizar-email-usuario";
  }

  if (lower.includes("failed to send") || lower.includes("fetch")) {
    return "No se pudo contactar al servidor. Despliega la Edge Function admin-actualizar-email-usuario en Supabase.";
  }

  if (lower.includes("jwt") || lower.includes("session")) {
    return "Tu sesión de administrador expiró. Vuelve a iniciar sesión.";
  }

  return message || "No se pudo actualizar el correo";
}

export async function updateUserEmailAdmin(
  input: AdminUpdateUserEmailInput
): Promise<AdminUpdateUserEmailResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "No hay sesión de administrador activa. Vuelve a entrar en /admin-login."
    );
  }

  const { data, error } = await supabase.functions.invoke(
    "admin-actualizar-email-usuario",
    {
      body: {
        target_user_id: input.targetUserId,
        new_email: input.newEmail.trim(),
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

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

    throw new Error(bodyFromData ?? mapInvokeError(error.message, status));
  }

  const body = data as EdgeResponse | null;

  if (!body || body.ok !== true || !body.user_id || !body.email) {
    throw new Error(
      bodyFromData ??
        body?.error ??
        "No se pudo actualizar el correo. Respuesta inválida del servidor."
    );
  }

  return {
    user_id: body.user_id,
    email: body.email,
  };
}
