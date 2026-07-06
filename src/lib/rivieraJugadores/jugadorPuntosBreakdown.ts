import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import {
  type CareerPointsByClubResult,
  shouldShowCareerPointsBreakdown,
  sortCareerClubsForDisplay,
} from "./careerPointsByClub";
import { rankingPuntosGlobalDisplay, rankingPuntosInternoClubDisplay } from "./grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "./types";

/** GUARD: No usar stats.puntos_totales local si existe careerPuntosByClub en ficha pública. */

export type JugadorPuntosBreakdownLine = {
  key: string;
  clubLabel: string;
  puntos: number;
  role: "home" | "other" | "total";
};

export function simpleJugadorPuntosDisplay(
  jugador: RivieraJugadorWithStats,
  hasOrgContext = false,
  viewingOrganizadorId?: string | null
): number {
  if (jugador.careerPuntosByClub && jugador.careerPuntosByClub.length > 0) {
    const viewOrg = viewingOrganizadorId?.trim();
    if (hasOrgContext && viewOrg) {
      const local = jugador.careerPuntosByClub.find(
        (entry) => entry.organizadorId === viewOrg
      );
      if (local) return local.puntos;
    }
    if (jugador.careerPuntosTotal != null && Number.isFinite(jugador.careerPuntosTotal)) {
      return jugador.careerPuntosTotal;
    }
    return jugador.careerPuntosByClub.reduce((sum, entry) => sum + entry.puntos, 0);
  }

  return hasOrgContext
    ? rankingPuntosInternoClubDisplay(jugador)
    : rankingPuntosGlobalDisplay(jugador);
}

function careerResultFromJugador(
  jugador: RivieraJugadorWithStats
): CareerPointsByClubResult | null {
  if (!jugador.careerPuntosByClub || jugador.careerPuntosByClub.length === 0) {
    return null;
  }

  const puntosByOrg = new Map(
    jugador.careerPuntosByClub.map((entry) => [entry.organizadorId, entry.puntos])
  );
  const total =
    jugador.careerPuntosTotal ??
    jugador.careerPuntosByClub.reduce((sum, entry) => sum + entry.puntos, 0);

  return {
    byClub: jugador.careerPuntosByClub,
    total,
    puntosByOrg,
  };
}

function buildLinesFromCareer(
  career: CareerPointsByClubResult,
  viewingOrganizadorId: string | null | undefined,
  options?: { localPuntos?: number; profileCard?: boolean }
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const byClub = [...career.byClub];
  if (viewOrg && !byClub.some((entry) => entry.organizadorId === viewOrg)) {
    byClub.push({ organizadorId: viewOrg, puntos: 0 });
  }

  const displayCareer: CareerPointsByClubResult = {
    ...career,
    byClub,
    puntosByOrg: new Map([
      ...Array.from(career.puntosByOrg.entries()),
      ...(viewOrg && !career.puntosByOrg.has(viewOrg)
        ? [[viewOrg, 0] as const]
        : []),
    ]),
  };

  const shouldShow =
    options?.profileCard ||
    shouldShowCareerPointsBreakdown(displayCareer, viewOrg, {
      localPuntos: options?.localPuntos,
    });

  if (!shouldShow) return [];

  const sorted = sortCareerClubsForDisplay(byClub, viewOrg);
  const lines: JugadorPuntosBreakdownLine[] = [];

  for (const entry of sorted) {
    if (entry.puntos <= 0 && entry.organizadorId !== viewOrg) continue;
    lines.push({
      key: entry.organizadorId,
      clubLabel: getOrganizerDisplayNameSync(entry.organizadorId),
      puntos: entry.puntos,
      role: entry.organizadorId === viewOrg ? "home" : "other",
    });
  }

  if (lines.length === 0) return [];

  const clubsWithPoints = lines.filter((line) => line.role !== "total" && line.puntos > 0);
  if (clubsWithPoints.length === 1 && career.total === clubsWithPoints[0]!.puntos) {
    return [];
  }

  lines.push({
    key: "total",
    clubLabel: "Total",
    puntos: career.total,
    role: "total",
  });

  return lines;
}

/**
 * Desglose de puntos por club desde carrera global (Riviera ID).
 */
export function buildJugadorPuntosBreakdown(
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId: string | null | undefined,
  options: { hasOrgContext?: boolean; profileCard?: boolean } = {}
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const localPuntos = rankingPuntosInternoClubDisplay(jugador);
  const career = careerResultFromJugador(jugador);

  if (career) {
    const lines = buildLinesFromCareer(career, viewOrg, {
      localPuntos,
      profileCard: options.profileCard,
    });
    if (lines.length > 0) return lines;
  }

  if (options.profileCard) return [];

  return [];
}
