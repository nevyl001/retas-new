import { supabase } from "../supabaseClient";
import { AVATAR_BUCKET } from "../rivieraJugadores/constants";
import { listJugadoresForAdmin } from "./accountControls";

export async function deleteUserComplete(userId: string): Promise<void> {
  const jugadores = await listJugadoresForAdmin(userId).catch(() => []);

  const { data, error } = await supabase.rpc("admin_delete_user_completo", {
    p_target_user_id: userId,
  });

  if (error) {
    if (
      error.message?.includes("admin_delete_user_completo") ||
      error.code === "PGRST202" ||
      error.code === "42883"
    ) {
      throw new Error(
        "Falta desplegar el SQL de borrado completo en Supabase (admin-delete-user-completo.sql)."
      );
    }
    throw new Error(error.message || "No se pudo eliminar el usuario");
  }

  if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
    throw new Error("No se pudo eliminar el usuario");
  }

  const paths = new Set<string>();
  for (const j of jugadores) {
    paths.add(`${userId}/${j.id}.jpg`);
  }

  try {
    const { data: listed } = await supabase.storage.from(AVATAR_BUCKET).list(userId, {
      limit: 200,
    });
    for (const file of listed ?? []) {
      if (file.name) paths.add(`${userId}/${file.name}`);
    }
  } catch {
    /* storage opcional */
  }

  if (paths.size > 0) {
    await supabase.storage.from(AVATAR_BUCKET).remove(Array.from(paths));
  }
}
