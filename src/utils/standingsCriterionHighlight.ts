import { getHeadToHead, type MatchResult } from "./standings";

export type StandingsCriterionKey = "fav" | "dif" | "pg";

export interface StandingsCompareRow {
  id: string;
  fav: number;
  con: number;
  pg: number;
}

export function standingsRowDiff(row: StandingsCompareRow): number {
  return row.fav - row.con;
}

/** Criterio que separa al de arriba del de abajo: FAV → DIF → H2H → PG. */
export function getDecidingCriterionBetween(
  higher: StandingsCompareRow,
  lower: StandingsCompareRow,
  h2hMatches: MatchResult[] = []
): StandingsCriterionKey {
  if (higher.fav !== lower.fav) return "fav";
  if (standingsRowDiff(higher) !== standingsRowDiff(lower)) return "dif";
  if (higher.id && lower.id && h2hMatches.length > 0) {
    const h2h = getHeadToHead(higher.id, lower.id, h2hMatches);
    if (h2h !== 0) return "pg";
  }
  if (higher.pg !== lower.pg) return "pg";
  return "fav";
}

export function criterionRank(column: StandingsCriterionKey): 1 | 2 | 3 {
  if (column === "fav") return 1;
  if (column === "dif") return 2;
  return 3;
}

export function criterionCellClass(
  column: StandingsCriterionKey,
  deciding: StandingsCriterionKey
): string {
  const rank = criterionRank(column);
  const isDeciding = column === deciding;
  return [
    "standings-criterion-cell",
    `standings-criterion-cell--${column}`,
    `standings-criterion-cell--rank-${rank}`,
    isDeciding ? "standings-criterion-cell--deciding" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function criterionHeaderClass(column: StandingsCriterionKey): string {
  return `standings-criterion-col standings-criterion-col--rank-${criterionRank(column)}`;
}
