import { computeStandingDif } from "../utils/standingsDisplay";
import type { PairWithStats, TeamStandingRow } from "./standingsUtils";

export type TeamWinnerCelebrateStats = Pick<
  TeamStandingRow,
  | "points"
  | "pointsReceived"
  | "matchesPlayed"
  | "pg"
  | "pp"
  | "puntosTorneo"
>;

export type TeamWinnerCelebrateStatCard = {
  value: string | number;
  label: string;
  highlight?: boolean;
};

export function teamStandingRowToWinnerStats(
  row: TeamStandingRow
): TeamWinnerCelebrateStats {
  return {
    points: row.points,
    pointsReceived: row.pointsReceived,
    matchesPlayed: row.matchesPlayed,
    pg: row.pg,
    pp: row.pp,
    puntosTorneo: row.puntosTorneo,
  };
}

export function pairWithStatsToWinnerStats(
  pair: PairWithStats
): TeamWinnerCelebrateStats {
  return {
    points: pair.points,
    pointsReceived: pair.pointsReceived,
    matchesPlayed: pair.matchesPlayed,
    pg: pair.pg,
    pp: pair.pp,
    puntosTorneo: pair.puntosTorneo,
  };
}

/** Mejor pareja del duelo: la de mayor games a favor (mismo orden que clasificación por parejas). */
export function resolveBestPairByGamesFor(
  sortedPairs: PairWithStats[]
): PairWithStats | null {
  const best = sortedPairs[0];
  if (!best) return null;
  if (best.matchesPlayed <= 0 && best.points <= 0) return null;
  return best;
}

/** Tarjetas de stats para celebración (games acumulados = criterio del dual meet). */
export function buildTeamWinnerCelebrateStatCards(
  stats: TeamWinnerCelebrateStats
): TeamWinnerCelebrateStatCard[] {
  const dif = computeStandingDif(stats.points, stats.pointsReceived);
  const difLabel = dif > 0 ? `+${dif}` : String(dif);

  return [
    { value: stats.points, label: "Games a favor", highlight: true },
    { value: stats.pointsReceived, label: "Games en contra" },
    { value: difLabel, label: "Diferencia" },
    { value: stats.pg, label: "Partidos ganados" },
    { value: stats.matchesPlayed, label: "Partidos jugados" },
    { value: stats.puntosTorneo, label: "Puntos juegos ganados" },
  ];
}
