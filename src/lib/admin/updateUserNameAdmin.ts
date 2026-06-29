import { supabase } from "../supabaseClient";

export interface AdminUpdateUserNameInput {
  targetUserId: string;
  newName: string;
}

export interface AdminUpdateUserNameResult {
  user_id: string;
  name: string;
}

function isMissingRpcError(
  error: { code?: string; message?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("admin_update_organizador_name") ||
    msg.includes("could not find the function")
  );
}

export async function updateUserNameAdmin(
  input: AdminUpdateUserNameInput
): Promise<AdminUpdateUserNameResult> {
  const trimmed = input.newName.trim();
  if (!trimmed) {
    throw new Error("El nombre es obligatorio.");
  }

  const { data, error } = await supabase.rpc("admin_update_organizador_name", {
    p_user_id: input.targetUserId,
    p_new_name: trimmed,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error(
        "Falta desplegar admin_update_organizador_name en Supabase (admin-master-controls.sql)."
      );
    }
    throw new Error(error.message || "No se pudo actualizar el nombre");
  }

  const body = (data ?? {}) as Record<string, unknown>;
  if (body.ok !== true || !body.user_id || !body.name) {
    throw new Error("No se pudo actualizar el nombre. Respuesta inválida del servidor.");
  }

  return {
    user_id: String(body.user_id),
    name: String(body.name),
  };
}
