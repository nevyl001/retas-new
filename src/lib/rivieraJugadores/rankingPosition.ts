import type { JugadorStats, RivieraJugadorWithStats } from "./types";

/** Puntos del registro local del club (incluye ajustes manuales). */
export function jugadorPuntosLocales(j: RivieraJugadorWithStats): number {
  return j.stats?.puntos_totales ?? 0;
}

/**
 * Puntos efectivos para ranking y fichas.
 * Respeta ajustes manuales del organizador (registro local) y no los pisa con ROMC
 * cuando el local es mayor; si ROMC supera al local, gana el oficial.
 */
export function resolveJugadorPuntosRanking(j: RivieraJugadorWithStats): number {
  const local = jugadorPuntosLocales(j);
  const official = j.officialPuntosGlobal;
  if (official == null || !Number.isFinite(official)) return local;
  return Math.max(local, official);
}

export function mergeJugadorStatsPuntosTotales(
  stats: JugadorStats,
  officialRomcPuntos?: number | null
): JugadorStats {
  if (officialRomcPuntos == null || !Number.isFinite(officialRomcPuntos)) {
    return stats;
  }
  return {
    ...stats,
    puntos_totales: Math.max(stats.puntos_totales, officialRomcPuntos),
  };
}

/** Puntos usados para ordenar el ranking público. */
export function rankingPuntosJugador(j: RivieraJugadorWithStats): number {
  return resolveJugadorPuntosRanking(j);
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
