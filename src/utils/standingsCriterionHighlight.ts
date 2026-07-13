import { getHeadToHead, type MatchResult } from "./standings";

export type StandingsCriterionKey = "fav" | "dif" | "pg";

/** Americano/Reta: FAV → DIF → PG. Torneo Express: PG → FAV → DIF. */
export type StandingsCriterionOrder = "americano" | "express";

export interface StandingsCompareRow {
  id: string;
  fav: number;
  con: number;
  pg: number;
}

export function standingsRowDiff(row: StandingsCompareRow): number {
  return row.fav - row.con;
}

/** Criterio que separa al de arriba del de abajo según el orden del modo. */
export function getDecidingCriterionBetween(
  higher: StandingsCompareRow,
  lower: StandingsCompareRow,
  h2hMatches: MatchResult[] = [],
  order: StandingsCriterionOrder = "americano"
): StandingsCriterionKey {
  if (order === "express") {
    if (higher.pg !== lower.pg) return "pg";
    if (higher.fav !== lower.fav) return "fav";
    if (standingsRowDiff(higher) !== standingsRowDiff(lower)) return "dif";
    if (higher.id && lower.id && h2hMatches.length > 0) {
      const h2h = getHeadToHead(higher.id, lower.id, h2hMatches);
      if (h2h !== 0) return "dif";
    }
    return "pg";
  }

  if (higher.fav !== lower.fav) return "fav";
  if (standingsRowDiff(higher) !== standingsRowDiff(lower)) return "dif";
  if (higher.id && lower.id && h2hMatches.length > 0) {
    const h2h = getHeadToHead(higher.id, lower.id, h2hMatches);
    if (h2h !== 0) return "pg";
  }
  if (higher.pg !== lower.pg) return "pg";
  return "fav";
}

export function criterionRank(
  column: StandingsCriterionKey,
  order: StandingsCriterionOrder = "americano"
): 1 | 2 | 3 {
  if (order === "express") {
    if (column === "pg") return 1;
    if (column === "fav") return 2;
    return 3;
  }
  if (column === "fav") return 1;
  if (column === "dif") return 2;
  return 3;
}

export function criterionCellClass(
  column: StandingsCriterionKey,
  deciding: StandingsCriterionKey,
  order: StandingsCriterionOrder = "americano"
): string {
  const rank = criterionRank(column, order);
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

export function criterionHeaderClass(
  column: StandingsCriterionKey,
  order: StandingsCriterionOrder = "americano"
): string {
  return `standings-criterion-col standings-criterion-col--rank-${criterionRank(column, order)}`;
}
