/**
 * Acumulación de stats para parejas_fijas_playoffs (ambos lados reciben puntos).
 * Aislado de applyPartidoToEquipoRankingStats (legacy solo suma al ganador).
 */

import {
  emptyEquipoRankingStats,
  type EquipoRankingStats,
} from "./equiposRanking";
import {
  computePlayoffsMatchPoints,
  derivePlayoffsGamesTotals,
  parsePlayoffsSetScoresJson,
  type PlayoffsMatchPoints,
} from "./parejasFijasPlayoffsMatchScore";

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

/**
 * Suma un partido completado al ranking de ambas parejas.
 * Devuelve false si el marcador no se puede clasificar; no toca las stats.
 */
export function foldPlayoffsMatchIntoRanking(
  statsByEquipo: Map<string, EquipoRankingStats>,
  match: {
    equipo1Id: string;
    equipo2Id: string;
    score1: number;
    score2: number;
    setScores: unknown;
  }
): boolean {
  if (!Number.isFinite(match.score1) || !Number.isFinite(match.score2)) {
    return false;
  }
  const payload = parsePlayoffsSetScoresJson(match.setScores);
  if (!payload) return false;
  const derived = derivePlayoffsGamesTotals(payload, match.score1, match.score2);
  if ("error" in derived) return false;
  const computed = computePlayoffsMatchPoints(
    derived.gamesTotalP1,
    derived.gamesTotalP2,
    payload
  );
  if (!computed.ok) return false;

  const st1 = statsByEquipo.get(match.equipo1Id) ?? emptyEquipoRankingStats();
  const st2 = statsByEquipo.get(match.equipo2Id) ?? emptyEquipoRankingStats();
  applyPlayoffsMatchBothSides(
    st1,
    st2,
    derived.gamesTotalP1,
    derived.gamesTotalP2,
    computed.result
  );
  statsByEquipo.set(match.equipo1Id, st1);
  statsByEquipo.set(match.equipo2Id, st2);
  return true;
}

export { emptyEquipoRankingStats };
