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

/**
 * `pairs.tournament_id` donde viven las parejas de la categoría. Usa
 * `source_tournament_id` si existe; si no, lo deduce de las parejas que ya
 * están en los grupos (todas comparten el mismo registro).
 */
export async function resolverRegistroParejas(input: {
  sourceTournamentId: string | null;
  parejaIds: string[];
}): Promise<string | null> {
  const source = input.sourceTournamentId?.trim();
  if (source) return source;
  const ids = Array.from(new Set(input.parejaIds.filter(Boolean))).slice(0, 50);
  if (ids.length === 0) return null;
  const { data, error } = await supabase
    .from("pairs")
    .select("tournament_id")
    .in("id", ids);
  if (error) throw new Error(formatSupabaseError(error));
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ tournament_id?: string | null }>) {
    const id = row.tournament_id?.trim();
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, id) => {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  });
  return best;
}
