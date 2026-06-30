import type { RivieraJugadorWithStats } from "./types";

/** Puntos usados para ordenar el ranking público. */
export function rankingPuntosJugador(j: RivieraJugadorWithStats): number {
  if (j.officialPuntosGlobal != null && Number.isFinite(j.officialPuntosGlobal)) {
    return j.officialPuntosGlobal;
  }
  return j.stats?.puntos_totales ?? 0;
}

/**
 * Ranking por competición (estilo Premier Padel / ATP):
 * mismo puntaje → misma posición; el siguiente salta (#1, #1, #3, #3, #7…).
 * La lista debe venir ordenada por puntos (desc) y nombre.
 */
export function rankingPosicionesFromSorted(
  jugadores: RivieraJugadorWithStats[]
): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < jugadores.length; i++) {
    const pts = rankingPuntosJugador(jugadores[i]);
    const prevPts = i > 0 ? rankingPuntosJugador(jugadores[i - 1]) : null;
    if (i === 0 || pts !== prevPts) {
      ranks.push(i + 1);
    } else {
      ranks.push(ranks[i - 1]!);
    }
  }
  return ranks;
}

export function rankingPosicionEnLista(
  jugadores: RivieraJugadorWithStats[],
  jugadorId: string
): number | null {
  const ranks = rankingPosicionesFromSorted(jugadores);
  const idx = jugadores.findIndex((j) => j.id === jugadorId);
  return idx >= 0 ? ranks[idx]! : null;
}
