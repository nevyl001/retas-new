import { deserializeBracketSlots } from "./bracketPersistence";
import { buildStandingsForGrupo } from "./standings";
import { supabase } from "../supabaseClient";
import type { TorneoExpressBundle } from "./types";
import { fetchTorneoExpressBundle } from "../../services/torneoExpressService";

const CLASIFICAN_POR_GRUPO = 2;

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

function pairIdsFromBracketSlots(bracketSlots: unknown): Set<string> {
  const ids = new Set<string>();
  for (const slot of deserializeBracketSlots(bracketSlots)) {
    if (slot.type === "team" && slot.qualifier.parejaId) {
      ids.add(slot.qualifier.parejaId);
    }
  }
  return ids;
}

function pairIdsFromBundleStandings(bundle: TorneoExpressBundle): Set<string> {
  const qualified = new Set<string>();
  const grupos = [...bundle.grupos].sort((a, b) => a.orden - b.orden);
  for (const grupo of grupos) {
    const tabla = buildStandingsForGrupo(
      grupo,
      bundle.parejasPorGrupo[grupo.id] ?? [],
      bundle.partidosPorGrupo[grupo.id] ?? []
    );
    tabla.slice(0, CLASIFICAN_POR_GRUPO).forEach((row) => qualified.add(row.parejaId));
  }
  return qualified;
}

/** Parejas que clasificaron (cuadro → bracket confirmado → top 2 por grupo). */
export async function fetchClasificadosPairIds(
  torneoExpressId: string
): Promise<Set<string>> {
  const fromPartidos = await pairIdsFromEliminatoriaPartidos(torneoExpressId);
  if (fromPartidos.size > 0) return fromPartidos;

  const { data: torneo, error: tErr } = await supabase
    .from("torneo_express")
    .select("bracket_slots")
    .eq("id", torneoExpressId)
    .maybeSingle();
  if (tErr) throw tErr;

  const fromSlots = pairIdsFromBracketSlots(torneo?.bracket_slots);
  if (fromSlots.size > 0) return fromSlots;

  const bundle = await fetchTorneoExpressBundle(torneoExpressId);
  if (!bundle) return new Set();
  return pairIdsFromBundleStandings(bundle);
}
