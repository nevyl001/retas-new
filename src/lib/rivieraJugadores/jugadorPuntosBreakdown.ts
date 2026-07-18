import {
  breakdownFromCareerResult,
  careerResultFromJugador,
} from "./playerPointsBreakdown";
import type {
  CareerPointsBreakdownView,
  PlayerPointsBreakdownClub,
} from "./playerPointsBreakdown";
import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import { sortCareerClubsForDisplay } from "./careerPointsByClub";
import { rankingPuntosInternoClubDisplay } from "./grantedRankingDisplay";
import { isValidRivieraId } from "./rivieraIdDisplay";
import type { RivieraJugadorWithStats } from "./types";

export type JugadorPuntosBreakdownLine = {
  key: string;
  clubLabel: string;
  puntos: number;
  role: "home" | "other" | "total" | "career-total";
};

/** Fila explícita por club (presentación; no altera puntos). */
export type ClubPointsDisplayRow = {
  organizerId: string;
  clubName: string;
  points: number;
  isContextClub: boolean;
  isRegistrationClub: boolean;
};

/**
 * Jugador con Riviera ID: el breakdown global aún no está listo (evita flash de stats locales).
 */
export function isRankingPointsBreakdownPending(
  jugador: RivieraJugadorWithStats,
  options?: { hasOrgContext?: boolean }
): boolean {
  if (!options?.hasOrgContext) return false;
  const rid = jugador.riviera_id?.trim();
  if (!rid || !isValidRivieraId(rid)) return false;
  return !jugador.pointsBreakdown;
}

function jugadorHasOfficialIdentity(jugador: RivieraJugadorWithStats): boolean {
  const rid = jugador.riviera_id?.trim();
  return Boolean(rid && isValidRivieraId(rid));
}

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

/**
 * Construye filas por club con labels resueltos por organizador_id (caché/RPC).
 * No usa club_name horneado ni hardcodea «Riviera Open».
 */
export function buildClubPointsDisplayRows(
  pointsByClub: PlayerPointsBreakdownClub[],
  options: {
    contextualOrganizerId: string | null | undefined;
    registrationOrganizerId?: string | null | undefined;
  }
): ClubPointsDisplayRow[] {
  const viewOrg = options.contextualOrganizerId?.trim() || null;
  const regOrg = options.registrationOrganizerId?.trim() || null;

  const byId = new Map<string, number>();
  for (const club of pointsByClub) {
    const id = club.organizador_id?.trim();
    if (!id) continue;
    if (club.points <= 0 && id !== viewOrg) continue;
    byId.set(id, club.points);
  }

  const rows: ClubPointsDisplayRow[] = Array.from(byId.entries()).map(
    ([organizerId, points]) => ({
      organizerId,
      clubName: getOrganizerDisplayNameSync(organizerId),
      points,
      isContextClub: Boolean(viewOrg && organizerId === viewOrg),
      isRegistrationClub: Boolean(regOrg && organizerId === regOrg),
    })
  );

  rows.sort((a, b) => {
    if (a.isContextClub !== b.isContextClub) return a.isContextClub ? -1 : 1;
    if (a.isRegistrationClub !== b.isRegistrationClub) {
      return a.isRegistrationClub ? -1 : 1;
    }
    if (b.points !== a.points) return b.points - a.points;
    return a.clubName.localeCompare(b.clubName, "es");
  });

  return rows;
}

export function breakdownToDisplayLines(
  breakdown: CareerPointsBreakdownView,
  currentOrganizadorId: string | null | undefined,
  options?: {
    forceBreakdown?: boolean;
    registrationOrganizerId?: string | null;
  }
): JugadorPuntosBreakdownLine[] {
  const viewOrg = currentOrganizadorId?.trim() || null;
  const clubsWithPoints = breakdown.pointsByClub.filter((c) => c.points > 0);
  const multiClub = clubsWithPoints.length >= 2;

  if (!options?.forceBreakdown && clubsWithPoints.length === 0) {
    return [];
  }

  const rows = buildClubPointsDisplayRows(breakdown.pointsByClub, {
    contextualOrganizerId: viewOrg,
    registrationOrganizerId: options?.registrationOrganizerId,
  });

  if (rows.length === 0) return [];

  const lines: JugadorPuntosBreakdownLine[] = rows.map((row) => ({
    key: row.organizerId,
    clubLabel: row.clubName,
    puntos: row.points,
    role: row.isContextClub ? "home" : "other",
  }));

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
    return rankingPuntosInternoClubDisplay(jugador, viewingOrganizadorId);
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
  options: {
    hasOrgContext?: boolean;
    profileCard?: boolean;
    registrationOrganizerId?: string | null;
  } = {}
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const breakdown = jugador.pointsBreakdown;
  const career = breakdown ? null : careerResultFromJugador(jugador);
  const resolvedBreakdown: CareerPointsBreakdownView | null =
    breakdown ??
    (career ? breakdownFromCareerResult(career, viewOrg) : null);

  if (resolvedBreakdown) {
    const lines = breakdownToDisplayLines(resolvedBreakdown, viewOrg, {
      forceBreakdown: Boolean(options.hasOrgContext || options.profileCard),
      registrationOrganizerId: options.registrationOrganizerId,
    });
    if (lines.length > 0) {
      return lines;
    }
  }

  if (options.profileCard || options.hasOrgContext) {
    if (jugadorHasOfficialIdentity(jugador)) {
      return [];
    }

    const pts = resolveCareerTotalAllClubsDisplay(
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
          role: "home" as const,
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
