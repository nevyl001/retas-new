import type { RankingItem } from "../liga/types";
import type { StandingRowExpress } from "../torneoExpress/types";
import type { StandingsMobileCardRow } from "../../components/standings/StandingsMobileCards";

export function ligaRankingItemToMobileRow(row: RankingItem): StandingsMobileCardRow {
  return {
    key: row.jugador_id,
    position: row.posicion,
    label: row.nombre,
    matchesPlayed: row.jornadas_jugadas,
    pg: 0,
    pp: 0,
    points: 0,
    pointsReceived: 0,
    puntosTorneo: row.puntos,
  };
}

export function teStandingRowToMobileRow(row: StandingRowExpress, index: number): StandingsMobileCardRow {
  return {
    key: `${row.grupoId}-${row.parejaId}`,
    position: index + 1,
    label: row.parejaLabel,
    matchesPlayed: row.pj,
    pg: row.pg,
    pp: row.pp,
    points: row.ptsFav,
    pointsReceived: row.ptsCon,
    puntosTorneo: row.puntos,
  };
}

export type SimpleRankingPresentationRow = {
  key: string;
  position: number;
  label: string;
  points: number;
  matchesPlayed?: number;
  pg?: number;
  pp?: number;
  pointsFav?: number;
  pointsCon?: number;
};

export function simpleRankingToMobileRow(row: SimpleRankingPresentationRow): StandingsMobileCardRow {
  return {
    key: row.key,
    position: row.position,
    label: row.label,
    matchesPlayed: row.matchesPlayed ?? 0,
    pg: row.pg ?? 0,
    pp: row.pp ?? 0,
    points: row.pointsFav ?? 0,
    pointsReceived: row.pointsCon ?? 0,
    puntosTorneo: row.points,
  };
}
