import type { JugadorStats, RivieraJugadorWithStats } from "./types";

/** Puntos del registro local del club (incluye ajustes manuales). */
export function jugadorPuntosLocales(j: RivieraJugadorWithStats): number {
  return j.stats?.puntos_totales ?? 0;
}

/** Puntos del club dueño del registro (jugador concedido / origen). */
export function jugadorPuntosOrigenConcedido(j: RivieraJugadorWithStats): number {
  return j.statsOrigenConcedido?.puntos_totales ?? 0;
}

/**
 * Puntos efectivos para ranking global / sitio oficial.
 * Respeta ajustes manuales y ROMC; en concedidos incluye el club dueño (origen).
 */
export function resolveJugadorPuntosRanking(j: RivieraJugadorWithStats): number {
  const candidates = [jugadorPuntosLocales(j)];
  const official = j.officialPuntosGlobal;
  if (official != null && Number.isFinite(official)) {
    candidates.push(official);
  }
  const origen = jugadorPuntosOrigenConcedido(j);
  if (origen > 0) {
    candidates.push(origen);
  }
  return Math.max(...candidates, 0);
}

/** Jugador con acceso concedido (perfil de otro club visible en este organizador). */
export function isJugadorConcedidoEnClub(j: RivieraJugadorWithStats): boolean {
  return Boolean(j.concedidoPorAdmin && j.grantedAccess?.sourceJugadorId);
}

/**
 * Puntos para ranking interno del club anfitrión.
 * Cedidos: solo partidos y puntos ganados EN ESTE club (perfil local).
 * Propios: local + ROMC/ajustes vía resolveJugadorPuntosRanking.
 */
export function rankingPuntosClubLocal(j: RivieraJugadorWithStats): number {
  if (isJugadorConcedidoEnClub(j)) {
    return jugadorPuntosLocales(j);
  }
  return resolveJugadorPuntosRanking(j);
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

/** Posiciones para ranking interno del club (cedidos = solo puntos locales). */
export function rankingPosicionesFromSortedForClub(
  jugadores: RivieraJugadorWithStats[]
): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < jugadores.length; i++) {
    const pts = rankingPuntosClubLocal(jugadores[i]);
    const prevPts = i > 0 ? rankingPuntosClubLocal(jugadores[i - 1]) : null;
    if (i === 0 || pts !== prevPts) {
      ranks.push(i + 1);
    } else {
      ranks.push(ranks[i - 1]!);
    }
  }
  return ranks;
}

export function sortJugadoresByClubLocalPuntos(
  jugadores: RivieraJugadorWithStats[]
): RivieraJugadorWithStats[] {
  return [...jugadores].sort((a, b) => {
    const pa = rankingPuntosClubLocal(a);
    const pb = rankingPuntosClubLocal(b);
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function rankingPosicionEnListaForClub(
  jugadores: RivieraJugadorWithStats[],
  jugadorId: string
): number | null {
  const ranks = rankingPosicionesFromSortedForClub(jugadores);
  const idx = jugadores.findIndex((j) => j.id === jugadorId);
  return idx >= 0 ? ranks[idx]! : null;
}
