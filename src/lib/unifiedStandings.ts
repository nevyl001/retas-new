/**
 * Capa de compatibilidad: expone el motor v2.0 (`utils/standings`) al resto de la app.
 */
import {
  calcularPuntos,
  createStandingsComparator,
  sortStandings,
  type MatchResult,
  type PairStanding,
} from "../utils/standings";

export {
  buildStandings,
  calcularPuntos,
  calculateFinalStandings,
  createStandingsComparator,
  formatStandingsForTable,
  sortStandings,
} from "../utils/standings";

export type { MatchResult, PairStanding };

/** @deprecated Usar MatchResult */
export type HeadToHeadMatch = MatchResult;

export interface UnifiedStandingStats {
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  ptsFav: number;
  ptsCon: number;
  puntos: number;
}

export interface StandingsEntity {
  id: string;
  label: string;
  seed?: number;
  stats: UnifiedStandingStats;
}

export function createEmptyStandingStats(): UnifiedStandingStats {
  return { pj: 0, pg: 0, pe: 0, pp: 0, ptsFav: 0, ptsCon: 0, puntos: 0 };
}

export function standingDiff(s: UnifiedStandingStats): number {
  return s.ptsFav - s.ptsCon;
}

export function pairStandingToUnified(s: PairStanding): UnifiedStandingStats {
  return {
    pj: s.PJ,
    pg: s.PG,
    pe: s.PE,
    pp: s.PP,
    ptsFav: s.juegosFavor,
    ptsCon: s.juegosContra,
    puntos: s.puntos,
  };
}

export function unifiedToPairStanding(
  id: string,
  name: string,
  seed: number,
  u: UnifiedStandingStats
): PairStanding {
  return {
    pairId: id,
    pairName: name,
    seed,
    PJ: u.pj,
    PG: u.pg,
    PE: u.pe,
    PP: u.pp,
    juegosFavor: u.ptsFav,
    juegosContra: u.ptsCon,
    diferencia: u.ptsFav - u.ptsCon,
    puntos: u.puntos,
  };
}

/** Aplica un partido con victoria=2, empate=1, derrota=0. */
export function applyMatchToStandingStats(
  local: UnifiedStandingStats,
  visit: UnifiedStandingStats,
  scoreLocal: number,
  scoreVisit: number
): void {
  local.pj += 1;
  visit.pj += 1;
  local.ptsFav += scoreLocal;
  local.ptsCon += scoreVisit;
  visit.ptsFav += scoreVisit;
  visit.ptsCon += scoreLocal;

  if (scoreLocal > scoreVisit) {
    local.pg += 1;
    visit.pp += 1;
  } else if (scoreVisit > scoreLocal) {
    visit.pg += 1;
    local.pp += 1;
  } else {
    local.pe += 1;
    visit.pe += 1;
  }

  local.puntos = calcularPuntos(local.pg, local.pe);
  visit.puntos = calcularPuntos(visit.pg, visit.pe);
}

export function sortStandingsEntities<T extends StandingsEntity>(
  rows: T[],
  h2hMatches: MatchResult[] = []
): T[] {
  const pairStandings = rows.map((r, i) =>
    unifiedToPairStanding(r.id, r.label, r.seed ?? i, r.stats)
  );
  const sorted = sortStandings(pairStandings, h2hMatches);
  const order = new Map(sorted.map((s) => [s.pairId, s.posicion ?? 0]));
  return [...rows].sort(
    (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)
  );
}

export function compareUnifiedStandingStats(
  a: UnifiedStandingStats,
  b: UnifiedStandingStats,
  opts?: {
    idA?: string;
    idB?: string;
    seedA?: number;
    seedB?: number;
    h2hMatches?: MatchResult[];
  }
): number {
  const cmp = createStandingsComparator(opts?.h2hMatches ?? []);
  return cmp(
    unifiedToPairStanding(
      opts?.idA ?? "a",
      "",
      opts?.seedA ?? 0,
      a
    ),
    unifiedToPairStanding(opts?.idB ?? "b", "", opts?.seedB ?? 0, b)
  );
}
