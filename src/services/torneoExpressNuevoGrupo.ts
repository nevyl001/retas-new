import { supabase } from "../lib/supabaseClient";
import {
  buildNuevoGrupoPartidos,
  NUEVO_GRUPO_MIN_PAREJAS,
} from "../lib/torneoExpress/nuevoGrupo";
import {
  fetchTorneoExpress,
  formatSupabaseError,
  isTorneoExpressClosed,
} from "./torneoExpressService";

/**
 * Grupo nuevo con la fase de grupos ya iniciada. No toca los grupos existentes:
 * crea el grupo, vincula las parejas y genera sus partidos (sin horario).
 * Las escrituras van una tras otra; si algo falla se deshace lo creado.
 */

export const GRUPO_NUEVO_NO_EDITABLE_MSG =
  "Esta categoría ya no admite grupos nuevos: ya pasó de la fase de grupos.";

export async function assertCategoriaAdmiteGrupos(torneoId: string): Promise<void> {
  const torneo = await fetchTorneoExpress(torneoId);
  if (!torneo) throw new Error("Torneo no encontrado");
  const fase = torneo.fase_torneo ?? "grupos";
  if (isTorneoExpressClosed(torneo) || fase !== "grupos") {
    throw new Error(GRUPO_NUEVO_NO_EDITABLE_MSG);
  }
}

/** Borra el grupo y lo que cuelga de él. Mejor esfuerzo: no lanza. */
export async function descartarGrupo(grupoId: string): Promise<void> {
  try {
    await supabase.from("torneo_express_partidos").delete().eq("grupo_id", grupoId);
    await supabase
      .from("torneo_express_grupo_parejas")
      .delete()
      .eq("grupo_id", grupoId);
    await supabase.from("torneo_express_grupos").delete().eq("id", grupoId);
  } catch {
    // Sin efecto: el siguiente refresco mostrará el estado real.
  }
}

/** Crea el grupo y vincula sus parejas (sin partidos). */
export async function crearGrupoConParejas(input: {
  torneoId: string;
  nombre: string;
  orden: number;
  parejaIds: string[];
}): Promise<string> {
  const parejaIds = Array.from(new Set(input.parejaIds.filter(Boolean)));
  await assertCategoriaAdmiteGrupos(input.torneoId);

  const { data, error } = await supabase
    .from("torneo_express_grupos")
    .insert({
      torneo_id: input.torneoId,
      nombre: input.nombre.trim(),
      orden: input.orden,
    })
    .select("id")
    .single();
  if (error) throw new Error(formatSupabaseError(error));
  const grupoId = (data as { id?: string } | null)?.id;
  if (!grupoId) throw new Error("No se recibió el id del grupo nuevo.");

  try {
    if (parejaIds.length > 0) {
      const { error: linkErr } = await supabase
        .from("torneo_express_grupo_parejas")
        .insert(parejaIds.map((pareja_id) => ({ grupo_id: grupoId, pareja_id })));
      if (linkErr) throw new Error(formatSupabaseError(linkErr));
    }
  } catch (e) {
    await descartarGrupo(grupoId);
    throw e;
  }
  return grupoId;
}

/** Grupo nuevo completo: parejas + todos contra todos sin horario. */
export async function crearGrupoNuevo(input: {
  torneoId: string;
  nombre: string;
  orden: number;
  parejaIds: string[];
}): Promise<{ grupoId: string; partidos: number }> {
  const parejaIds = Array.from(new Set(input.parejaIds.filter(Boolean)));
  if (parejaIds.length < NUEVO_GRUPO_MIN_PAREJAS) {
    throw new Error(
      `El grupo necesita al menos ${NUEVO_GRUPO_MIN_PAREJAS} parejas.`
    );
  }

  const grupoId = await crearGrupoConParejas({ ...input, parejaIds });

  try {
    const rows = buildNuevoGrupoPartidos(parejaIds).map((row) => ({
      ...row,
      grupo_id: grupoId,
    }));
    const { error } = await supabase.from("torneo_express_partidos").insert(rows);
    if (error) throw new Error(formatSupabaseError(error));
    return { grupoId, partidos: rows.length };
  } catch (e) {
    await descartarGrupo(grupoId);
    throw e;
  }
}
