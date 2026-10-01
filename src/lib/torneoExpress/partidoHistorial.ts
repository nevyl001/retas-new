import { parseSetsResultado } from "./partidoSets";

/** Datos persistidos que prueban que un partido ya tiene historial. */
export type PartidoHistorialSource = {
  estado?: string | null;
  ganador_id?: string | null;
  puntos_local?: number | null;
  puntos_visitante?: number | null;
  sets_resultado?: unknown;
};

/**
 * Un partido tiene historial si cualquiera de los indicadores persistidos
 * está presente. No usa el badge visual «EN JUEGO».
 */
export function partidoTieneHistorial(partido: PartidoHistorialSource): boolean {
  if (partido.estado === "jugado") return true;
  if (partido.ganador_id != null && partido.ganador_id !== "") return true;
  if (partido.puntos_local != null) return true;
  if (partido.puntos_visitante != null) return true;
  return parseSetsResultado(partido.sets_resultado) != null;
}

export type PartidoDePareja = PartidoHistorialSource & {
  pareja_local_id: string;
  pareja_visitante_id: string;
};

/** Historial de una pareja: solo sus partidos, no los del resto de la categoría. */
export function parejaTieneHistorial(
  partidos: PartidoDePareja[],
  parejaId: string
): boolean {
  const id = parejaId.trim();
  if (!id) return false;
  return partidos.some(
    (partido) =>
      (partido.pareja_local_id === id || partido.pareja_visitante_id === id) &&
      partidoTieneHistorial(partido)
  );
}
