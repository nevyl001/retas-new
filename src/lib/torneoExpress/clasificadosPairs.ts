import { deserializeBracketSlots } from "./bracketPersistence";
import { calcularClasificadosFase } from "./bracket";
import { reglaClasificacion } from "./reglaClasificacion";
import { buildStandingsForGrupo, puestoResuelto } from "./standings";
import { supabase } from "../supabaseClient";
import type { TorneoExpressBundle } from "./types";
import { fetchTorneoExpressBundle } from "../../services/torneoExpressService";

async function pairIdsFromEliminatoriaPartidos(
  torneoExpressId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("pareja_local_id, pareja_visitante_id")
    .eq("torneo_id", torneoExpressId);
  if (error) throw error;

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.pareja_local_id) ids.add(row.pareja_local_id as string);
    if (row.pareja_visitante_id) ids.add(row.pareja_visitante_id as string);
  }
  return ids;
}

export function pairIdsFromBracketSlots(bracketSlots: unknown): Set<string> {
  const ids = new Set<string>();
  for (const slot of deserializeBracketSlots(bracketSlots)) {
    if (slot.type === "team" && slot.qualifier.parejaId) {
      ids.add(slot.qualifier.parejaId);
    }
  }
  return ids;
}

function pairIdsClasificadosFromEliminatoria(bundle: TorneoExpressBundle): Set<string> {
  const ids = new Set<string>();
  for (const row of bundle.eliminatoriaPartidos) {
    if (row.pareja_local_id) ids.add(row.pareja_local_id);
    if (row.pareja_visitante_id) ids.add(row.pareja_visitante_id);
  }
  return ids;
}

function pairIdsFromBundleStandings(bundle: TorneoExpressBundle): Set<string> {
  const qualified = new Set<string>();
  const regla = reglaClasificacion(bundle.grupos.length);
  const posiciones = regla.porGrupo === 1 ? [1] : [1, 2];
  const grupos = [...bundle.grupos].sort((a, b) => a.orden - b.orden);
  for (const grupo of grupos) {
    const tabla = buildStandingsForGrupo(
      grupo,
      bundle.parejasPorGrupo[grupo.id] ?? [],
      bundle.partidosPorGrupo[grupo.id] ?? [],
      bundle.clasificacion_modo
    );
    posiciones.forEach((posicion) => {
      const row = puestoResuelto(tabla, posicion);
      if (row) qualified.add(row.parejaId);
    });
  }
  if (regla.faseUnica) {
    // 7 grupos: los primeros + el mejor segundo.
    try {
      calcularClasificadosFase(bundle, regla.faseUnica, {
        skipValidation: true,
      }).forEach((q) => qualified.add(q.parejaId));
    } catch {
      // Sin tablas resueltas: quedan solo los primeros.
    }
  }
  return qualified;
}

/** Parejas que clasificaron de grupos (cuadro, bracket o top por grupo (regla de clasificación)). */
export function clasificadosPairIdsFromBundle(bundle: TorneoExpressBundle): Set<string> {
  const fromPartidos = pairIdsClasificadosFromEliminatoria(bundle);
  if (fromPartidos.size > 0) return fromPartidos;

  const fromSlots = pairIdsFromBracketSlots(bundle.torneo.bracket_slots);
  if (fromSlots.size > 0) return fromSlots;

  return pairIdsFromBundleStandings(bundle);
}

/** Parejas que clasificaron (cuadro → bracket confirmado → top por grupo (regla de clasificación)). */
export async function fetchClasificadosPairIds(
  torneoExpressId: string
): Promise<Set<string>> {
  const fromPartidos = await pairIdsFromEliminatoriaPartidos(torneoExpressId);
  if (fromPartidos.size > 0) return fromPartidos;

  const bundle = await fetchTorneoExpressBundle(torneoExpressId);
  if (!bundle) return new Set();
  return clasificadosPairIdsFromBundle(bundle);
}
