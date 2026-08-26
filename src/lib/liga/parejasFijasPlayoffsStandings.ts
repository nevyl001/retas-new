/**
 * Comparator oficial de Tabla General — solo `parejas_fijas_playoffs`.
 *
 * Orden EXACTO:
 * 1. puntos DESC
 * 2. diferencia de games (GF − GC) DESC
 * 3. enfrentamiento directo (puntos de clasificación solo en cruces mutuos)
 *
 * NO usa GF aislado, PG, PJ, nombre ni seed como criterio deportivo.
 * Si tras H2H sigue empate absoluto: el comparator devuelve 0 (sin 4.º criterio
 * deportivo aprobado). El freeze debe detectar empates irresolubles; no inventar
 * posición arbitraria.
 *
 * Ver regla oficial en parejasFijasPlayoffsMatchScore.ts.
 */

import type { EquipoRankingSortRow } from "./equiposRanking";
import {
  computePlayoffsMatchPoints,
  parsePlayoffsSetScoresJson,
} from "./parejasFijasPlayoffsMatchScore";

export type PlayoffsStandingRow = EquipoRankingSortRow & {
  equipo_id: string;
};

/** Partido regular completado con puntos de clasificación ya derivados. */
export type PlayoffsH2HMatch = {
  equipo1Id: string;
  equipo2Id: string;
  /** Puntos de clasificación de pareja 1 en ese partido. */
  points1: number;
  /** Puntos de clasificación de pareja 2 en ese partido. */
  points2: number;
};

export type PlayoffsStandingsContext = {
  /** Cruces regulares (ida/vuelta) con puntos de clasificación. */
  headToHeadMatches: PlayoffsH2HMatch[];
};

/**
 * Suma puntos de clasificación obtenidos únicamente en enfrentamientos
 * directos entre A y B (no mezcla terceros).
 * Retorno: puntosH2H(A) − puntosH2H(B). Positivo ⇒ A mejor en H2H.
 */
export function headToHeadClassificationPointsDiff(
  equipoAId: string,
  equipoBId: string,
  matches: PlayoffsH2HMatch[]
): number {
  let ptsA = 0;
  let ptsB = 0;
  for (const m of matches) {
    const aIs1 = m.equipo1Id === equipoAId && m.equipo2Id === equipoBId;
    const aIs2 = m.equipo1Id === equipoBId && m.equipo2Id === equipoAId;
    if (aIs1) {
      ptsA += m.points1;
      ptsB += m.points2;
    } else if (aIs2) {
      ptsA += m.points2;
      ptsB += m.points1;
    }
  }
  return ptsA - ptsB;
}

/**
 * Comparator: puntos → DIF → H2H.
 * Negativo ⇒ A queda arriba.
 */
export function compareParejasFijasPlayoffsStandings(
  a: PlayoffsStandingRow,
  b: PlayoffsStandingRow,
  context: PlayoffsStandingsContext
): number {
  if (b.puntos !== a.puntos) return b.puntos - a.puntos;
  if (b.diferencia_games !== a.diferencia_games) {
    return b.diferencia_games - a.diferencia_games;
  }
  const h2h = headToHeadClassificationPointsDiff(
    a.equipo_id,
    b.equipo_id,
    context.headToHeadMatches
  );
  if (h2h !== 0) return -h2h; // A con más H2H → negativo → A primero
  return 0;
}

/**
 * Detecta si hay empates absolutos (PTS + DIF + H2H) entre algún par
 * del ranking ya ordenado. Útil antes de congelar seeds.
 */
export function findUnresolvedPlayoffsStandingTies(
  ranked: PlayoffsStandingRow[],
  context: PlayoffsStandingsContext
): Array<{ a: string; b: string }> {
  const ties: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const a = ranked[i]!;
      const b = ranked[j]!;
      if (compareParejasFijasPlayoffsStandings(a, b, context) === 0) {
        ties.push({ a: a.equipo_id, b: b.equipo_id });
      }
    }
  }
  return ties;
}

export function sortParejasFijasPlayoffsStandings<T extends PlayoffsStandingRow>(
  rows: T[],
  context: PlayoffsStandingsContext
): T[] {
  return [...rows].sort((a, b) =>
    compareParejasFijasPlayoffsStandings(a, b, context)
  );
}

/** Construye un cruce H2H desde un partido completado (o null si no se puede derivar). */
export function tryBuildPlayoffsH2HMatch(input: {
  equipo1Id: string;
  equipo2Id: string;
  score1: number;
  score2: number;
  setScores: unknown;
}): PlayoffsH2HMatch | null {
  const payload = parsePlayoffsSetScoresJson(input.setScores);
  if (!payload) return null;
  const computed = computePlayoffsMatchPoints(
    input.score1,
    input.score2,
    payload
  );
  if (!computed.ok) return null;
  return {
    equipo1Id: input.equipo1Id,
    equipo2Id: input.equipo2Id,
    points1: computed.result.pointsP1,
    points2: computed.result.pointsP2,
  };
}
