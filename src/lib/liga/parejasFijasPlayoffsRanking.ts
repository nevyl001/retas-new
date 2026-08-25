/**
 * Acumulación de stats para parejas_fijas_playoffs (ambos lados reciben puntos).
 * Aislado de applyPartidoToEquipoRankingStats (legacy solo suma al ganador).
 */

import {
  emptyEquipoRankingStats,
  type EquipoRankingStats,
} from "./equiposRanking";
import type { PlayoffsMatchPoints } from "./parejasFijasPlayoffsMatchScore";

export function applyPlayoffsMatchToEquipoStats(
  stats: EquipoRankingStats,
  gamesFor: number,
  gamesAgainst: number,
  points: number,
  won: boolean
): void {
  stats.partidos_jugados += 1;
  stats.games_favor += gamesFor;
  stats.games_contra += gamesAgainst;
  stats.puntos += points;
  if (won) stats.partidos_ganados += 1;
  else stats.partidos_perdidos += 1;
}

export function applyPlayoffsMatchBothSides(
  statsP1: EquipoRankingStats,
  statsP2: EquipoRankingStats,
  gamesP1: number,
  gamesP2: number,
  result: PlayoffsMatchPoints
): void {
  applyPlayoffsMatchToEquipoStats(
    statsP1,
    gamesP1,
    gamesP2,
    result.pointsP1,
    result.p1Won
  );
  applyPlayoffsMatchToEquipoStats(
    statsP2,
    gamesP2,
    gamesP1,
    result.pointsP2,
    !result.p1Won
  );
}

export { emptyEquipoRankingStats };
