/**
 * Reglas de clasificación compartidas (Round Robin, Equipos, Torneo Express, Americano).
 *
 * Puntos de torneo por partido: victoria 2, derrota 1, empate 1–1.
 * Orden: Dif → PG → PP (menos) → Pts a favor → Pts en contra → Puntos torneo → H2H → nombre.
 */

export const STANDING_POINTS_WIN = 2;
export const STANDING_POINTS_LOSS = 1;
export const STANDING_POINTS_TIE = 1;

export interface UnifiedStandingStats {
  pj: number;
  pg: number;
  pp: number;
  ptsFav: number;
  ptsCon: number;
  /** Puntos de torneo (tabla). */
  puntos: number;
}

export interface StandingsEntity {
  id: string;
  label: string;
  stats: UnifiedStandingStats;
}

export interface HeadToHeadMatch {
  idA: string;
  idB: string;
  scoreA: number;
  scoreB: number;
}

export function createEmptyStandingStats(): UnifiedStandingStats {
  return { pj: 0, pg: 0, pp: 0, ptsFav: 0, ptsCon: 0, puntos: 0 };
}

export function standingDiff(s: UnifiedStandingStats): number {
  return s.ptsFav - s.ptsCon;
}

/** Aplica resultado de un partido jugado entre dos entidades (pareja, jugador, etc.). */
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
    local.puntos += STANDING_POINTS_WIN;
    visit.puntos += STANDING_POINTS_LOSS;
  } else if (scoreVisit > scoreLocal) {
    visit.pg += 1;
    local.pp += 1;
    visit.puntos += STANDING_POINTS_WIN;
    local.puntos += STANDING_POINTS_LOSS;
  } else {
    local.puntos += STANDING_POINTS_TIE;
    visit.puntos += STANDING_POINTS_TIE;
  }
}

export function headToHeadTournamentPoints(
  tiedIds: string[],
  matches: HeadToHeadMatch[]
): Map<string, number> {
  const set = new Set(tiedIds);
  const h2h = new Map<string, number>();
  tiedIds.forEach((id) => h2h.set(id, 0));

  matches.forEach((m) => {
    if (!set.has(m.idA) || !set.has(m.idB)) return;
    if (m.scoreA > m.scoreB) {
      h2h.set(m.idA, (h2h.get(m.idA) ?? 0) + STANDING_POINTS_WIN);
      h2h.set(m.idB, (h2h.get(m.idB) ?? 0) + STANDING_POINTS_LOSS);
    } else if (m.scoreB > m.scoreA) {
      h2h.set(m.idB, (h2h.get(m.idB) ?? 0) + STANDING_POINTS_WIN);
      h2h.set(m.idA, (h2h.get(m.idA) ?? 0) + STANDING_POINTS_LOSS);
    } else {
      h2h.set(m.idA, (h2h.get(m.idA) ?? 0) + STANDING_POINTS_TIE);
      h2h.set(m.idB, (h2h.get(m.idB) ?? 0) + STANDING_POINTS_TIE);
    }
  });

  return h2h;
}

/**
 * Comparador de clasificación (mayor = mejor posición).
 */
export function compareUnifiedStandingStats(
  a: UnifiedStandingStats,
  b: UnifiedStandingStats,
  opts?: {
    idA?: string;
    idB?: string;
    allRows?: UnifiedStandingStats[];
    allIds?: string[];
    h2hMatches?: HeadToHeadMatch[];
    labelA?: string;
    labelB?: string;
  }
): number {
  const difA = standingDiff(a);
  const difB = standingDiff(b);
  if (difB !== difA) return difB - difA;

  if (b.pg !== a.pg) return b.pg - a.pg;

  if (a.pp !== b.pp) return a.pp - b.pp;

  if (b.ptsFav !== a.ptsFav) return b.ptsFav - a.ptsFav;

  if (a.ptsCon !== b.ptsCon) return a.ptsCon - b.ptsCon;

  if (b.puntos !== a.puntos) return b.puntos - a.puntos;

  const idA = opts?.idA;
  const idB = opts?.idB;
  const h2hMatches = opts?.h2hMatches;
  const allRows = opts?.allRows;
  const allIds = opts?.allIds;

  if (idA && idB && h2hMatches?.length && allRows?.length && allIds?.length) {
    const tiedIds = allIds.filter(
      (_, idx) => standingDiff(allRows[idx] ?? a) === difA
    );
    if (
      tiedIds.length >= 2 &&
      tiedIds.includes(idA) &&
      tiedIds.includes(idB)
    ) {
      const h2h = headToHeadTournamentPoints(tiedIds, h2hMatches);
      const diffH2h = (h2h.get(idB) ?? 0) - (h2h.get(idA) ?? 0);
      if (diffH2h !== 0) return diffH2h;
    }
  }

  const labelA = opts?.labelA ?? "";
  const labelB = opts?.labelB ?? "";
  return labelA.localeCompare(labelB, "es");
}

export function sortStandingsEntities<T extends StandingsEntity>(
  rows: T[],
  h2hMatches: HeadToHeadMatch[] = []
): T[] {
  const snapshot = [...rows];
  const statsList = snapshot.map((r) => r.stats);
  const ids = snapshot.map((r) => r.id);

  snapshot.sort((a, b) =>
    compareUnifiedStandingStats(a.stats, b.stats, {
      idA: a.id,
      idB: b.id,
      allRows: statsList,
      allIds: ids,
      h2hMatches,
      labelA: a.label,
      labelB: b.label,
    })
  );

  return snapshot;
}
