import { computeStandingDif } from "../utils/standingsDisplay";
import type { TeamStandingRow } from "./standingsUtils";

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
    { value: stats.puntosTorneo, label: "Puntos torneo" },
  ];
}
