import {
  breakdownFromCareerResult,
  careerResultFromJugador,
  type PlayerPointsBreakdown,
} from "./playerPointsBreakdown";
import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import { sortCareerClubsForDisplay } from "./careerPointsByClub";
import { rankingPuntosInternoClubDisplay } from "./grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "./types";

export type JugadorPuntosBreakdownLine = {
  key: string;
  clubLabel: string;
  puntos: number;
  role: "home" | "other" | "total";
};

export function breakdownToDisplayLines(
  breakdown: PlayerPointsBreakdown,
  currentOrganizadorId: string | null | undefined,
  options?: { forceBreakdown?: boolean }
): JugadorPuntosBreakdownLine[] {
  const viewOrg = currentOrganizadorId?.trim() || null;
  const clubsWithPoints = breakdown.pointsByClub.filter((c) => c.points > 0);
  const multiClub = clubsWithPoints.length >= 2;

  if (!options?.forceBreakdown && clubsWithPoints.length === 0) {
    return [];
  }

  const lines: JugadorPuntosBreakdownLine[] = [];

  for (const club of breakdown.pointsByClub) {
    if (club.points <= 0 && club.organizador_id !== viewOrg) continue;
    lines.push({
      key: club.organizador_id,
      clubLabel: club.club_name || getOrganizerDisplayNameSync(club.organizador_id),
      puntos: club.points,
      role: club.organizador_id === viewOrg ? "home" : "other",
    });
  }

  if (lines.length === 0) return [];

  if (multiClub && breakdown.globalTotalPoints > 0) {
    lines.push({
      key: "total",
      clubLabel: "Total",
      puntos: breakdown.globalTotalPoints,
      role: "total",
    });
  }

  return lines;
}

/**
 * Puntos simples (sin desglose) desde breakdown canónico o fallback local.
 */
export function simpleJugadorPuntosDisplay(
  jugador: RivieraJugadorWithStats,
  hasOrgContext = false,
  viewingOrganizadorId?: string | null
): number {
  const career = careerResultFromJugador(jugador);
  if (career) {
    const breakdown = breakdownFromCareerResult(career, viewingOrganizadorId);
    if (hasOrgContext && viewingOrganizadorId?.trim()) {
      return breakdown.currentClubPoints;
    }
    return breakdown.globalTotalPoints;
  }

  return hasOrgContext
    ? rankingPuntosInternoClubDisplay(jugador)
    : jugador.stats?.puntos_totales ?? 0;
}

/**
 * Desglose visual de puntos — siempre desde career canónico en el jugador.
 */
export function buildJugadorPuntosBreakdown(
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId: string | null | undefined,
  options: { hasOrgContext?: boolean; profileCard?: boolean } = {}
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const career = careerResultFromJugador(jugador);

  if (career) {
    const breakdown = breakdownFromCareerResult(career, viewOrg);
    const lines = breakdownToDisplayLines(breakdown, viewOrg, {
      forceBreakdown: Boolean(options.hasOrgContext || options.profileCard),
    });
    if (lines.length > 0) return lines;
  }

  if (options.profileCard || options.hasOrgContext) {
    const pts = simpleJugadorPuntosDisplay(
      jugador,
      options.hasOrgContext,
      viewingOrganizadorId
    );
    if (viewOrg) {
      return [
        {
          key: viewOrg,
          clubLabel: getOrganizerDisplayNameSync(viewOrg),
          puntos: pts,
          role: "home",
        },
      ];
    }
  }

  return [];
}

/** @deprecated Usar breakdownFromCareerResult — mantenido para tests legacy */
export function sortBreakdownClubsForDisplay(
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId: string | null | undefined
) {
  const career = careerResultFromJugador(jugador);
  if (!career) return [];
  return sortCareerClubsForDisplay(career.byClub, viewingOrganizadorId);
}
