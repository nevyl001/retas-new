/** Stats acumuladas por equipo en liga parejas_fijas (puntos = games a favor). */
export type EquipoRankingStats = {
  puntos: number;
  partidos_jugados: number;
  partidos_ganados: number;
  partidos_perdidos: number;
  games_favor: number;
  games_contra: number;
};

export function emptyEquipoRankingStats(): EquipoRankingStats {
  return {
    puntos: 0,
    partidos_jugados: 0,
    partidos_ganados: 0,
    partidos_perdidos: 0,
    games_favor: 0,
    games_contra: 0,
  };
}

/**
 * Aplica un partido completado.
 * Puntos ranking = games a favor. PG/PP = ganador del partido (sets en parejas fijas).
 */
export function applyPartidoToEquipoRankingStats(
  stats: EquipoRankingStats,
  gamesFor: number,
  gamesAgainst: number,
  matchWon?: boolean | null
): void {
  stats.partidos_jugados += 1;
  stats.games_favor += gamesFor;
  stats.games_contra += gamesAgainst;
  stats.puntos += gamesFor;

  const won =
    matchWon === true
      ? true
      : matchWon === false
        ? false
        : gamesFor > gamesAgainst
          ? true
          : gamesFor < gamesAgainst
            ? false
            : null;

  if (won === true) {
    stats.partidos_ganados += 1;
  } else if (won === false) {
    stats.partidos_perdidos += 1;
  }
}

export function diferenciaGamesFromStats(
  stats: EquipoRankingStats
): number {
  return stats.games_favor - stats.games_contra;
}

export type EquipoRankingSortRow = {
  puntos: number;
  diferencia_games: number;
  games_favor: number;
  partidos_ganados: number;
  partidos_jugados: number;
  nombre?: string | null;
};

/** Orden: puntos → DIF → GF → PG → PJ asc → nombre. */
export function compareEquiposRanking(
  a: EquipoRankingSortRow,
  b: EquipoRankingSortRow
): number {
  if (b.puntos !== a.puntos) return b.puntos - a.puntos;
  if (b.diferencia_games !== a.diferencia_games) {
    return b.diferencia_games - a.diferencia_games;
  }
  if (b.games_favor !== a.games_favor) {
    return b.games_favor - a.games_favor;
  }
  if (b.partidos_ganados !== a.partidos_ganados) {
    return b.partidos_ganados - a.partidos_ganados;
  }
  if (a.partidos_jugados !== b.partidos_jugados) {
    return a.partidos_jugados - b.partidos_jugados;
  }
  return a.nombre?.localeCompare(b.nombre ?? "") ?? 0;
}
