import {
  breakdownFromCareerResult,
  careerResultFromJugador,
  type CareerPointsBreakdownView,
  type PlayerPointsBreakdown,
} from "./playerPointsBreakdown";
import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import { sortCareerClubsForDisplay } from "./careerPointsByClub";
import { rankingPuntosInternoClubDisplay } from "./grantedRankingDisplay";
import {
  logRankingPointsAudit,
  snapshotFromBreakdown,
  snapshotFromDisplayLines,
} from "./rankingPointsAudit";
import type { RivieraJugadorWithStats } from "./types";

export type JugadorPuntosBreakdownLine = {
  key: string;
  clubLabel: string;
  puntos: number;
  role: "home" | "other" | "total" | "career-total";
};

/** ROMC disponible (incluye 0 real) vs sin dato oficial. */
export type OfficialPuntosDisplay =
  | { kind: "available"; puntos: number }
  | { kind: "unavailable" };

export function resolveOfficialPuntosDisplay(
  jugador: RivieraJugadorWithStats
): OfficialPuntosDisplay {
  const fromBreakdown = jugador.pointsBreakdown?.officialGlobalPoints;
  const value =
    fromBreakdown !== undefined ? fromBreakdown : jugador.officialPuntosGlobal ?? null;
  if (value != null && Number.isFinite(value)) {
    return { kind: "available", puntos: value };
  }
  return { kind: "unavailable" };
}

export function breakdownToDisplayLines(
  breakdown: CareerPointsBreakdownView,
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

  if (multiClub && breakdown.careerTotalAllClubs > 0) {
    lines.push({
      key: "career-total",
      clubLabel: "Total carrera",
      puntos: breakdown.careerTotalAllClubs,
      role: "career-total",
    });
  }

  return lines;
}

/** Puntos de carrera local (todos los clubes); nunca ROMC. */
export function resolveCareerTotalAllClubsDisplay(
  jugador: RivieraJugadorWithStats,
  hasOrgContext = false,
  viewingOrganizadorId?: string | null
): number {
  if (jugador.pointsBreakdown) {
    if (hasOrgContext && viewingOrganizadorId?.trim()) {
      return jugador.pointsBreakdown.currentClubPoints;
    }
    return jugador.pointsBreakdown.careerTotalAllClubs;
  }

  const career = careerResultFromJugador(jugador);
  if (career) {
    const breakdown = breakdownFromCareerResult(career, viewingOrganizadorId);
    if (hasOrgContext && viewingOrganizadorId?.trim()) {
      return breakdown.currentClubPoints;
    }
    return breakdown.careerTotalAllClubs;
  }

  if (hasOrgContext) {
    return rankingPuntosInternoClubDisplay(jugador);
  }

  return jugador.stats?.puntos_totales ?? 0;
}

/**
 * @deprecated Usar resolveCareerTotalAllClubsDisplay (carrera) o resolveOfficialPuntosDisplay (ROMC).
 */
export function simpleJugadorPuntosDisplay(
  jugador: RivieraJugadorWithStats,
  hasOrgContext = false,
  viewingOrganizadorId?: string | null
): number {
  return resolveCareerTotalAllClubsDisplay(
    jugador,
    hasOrgContext,
    viewingOrganizadorId
  );
}

/**
 * Desglose visual de puntos de carrera (local por club) — nunca ROMC.
 */
export function buildJugadorPuntosBreakdown(
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId: string | null | undefined,
  options: { hasOrgContext?: boolean; profileCard?: boolean } = {}
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const breakdown = jugador.pointsBreakdown;
  const career = breakdown ? null : careerResultFromJugador(jugador);
  const resolvedBreakdown: CareerPointsBreakdownView | null =
    breakdown ??
    (career ? breakdownFromCareerResult(career, viewOrg) : null);

  if (resolvedBreakdown) {
    logRankingPointsAudit(
      "jugadorPuntosBreakdown.buildJugadorPuntosBreakdown (career)",
      jugador,
      snapshotFromBreakdown(resolvedBreakdown, viewOrg),
      { viewingOrganizadorId: viewOrg }
    );
    const lines = breakdownToDisplayLines(resolvedBreakdown, viewOrg, {
      forceBreakdown: Boolean(options.hasOrgContext || options.profileCard),
    });
    if (lines.length > 0) {
      logRankingPointsAudit(
        "jugadorPuntosBreakdown.buildJugadorPuntosBreakdown (display lines)",
        jugador,
        snapshotFromDisplayLines(lines, viewOrg)
      );
      return lines;
    }
  }

  if (options.profileCard || options.hasOrgContext) {
    const pts = resolveCareerTotalAllClubsDisplay(
      jugador,
      options.hasOrgContext,
      viewingOrganizadorId
    );
    if (viewOrg) {
      const fallbackLines = [
        {
          key: viewOrg,
          clubLabel: getOrganizerDisplayNameSync(viewOrg),
          puntos: pts,
          role: "home" as const,
        },
      ];
      logRankingPointsAudit(
        "jugadorPuntosBreakdown.buildJugadorPuntosBreakdown (FALLBACK stats→club)",
        jugador,
        { clubPoints: pts, rivieraPoints: 0, totalPoints: pts },
        {
          warning:
            "career ausente — stats.puntos_totales etiquetado como club actual",
          statsPuntosTotales: jugador.stats?.puntos_totales,
        }
      );
      return fallbackLines;
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
