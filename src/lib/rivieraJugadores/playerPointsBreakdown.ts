/**
 * Fuente canónica de desglose de puntos por club.
 * Toda pantalla (ranking card, ficha, ranking global) debe consumir esto.
 */
import { getCachedOrganizerDisplayName } from "../organizer/organizerDisplayName";
import {
  attachCareerPuntosToJugador,
  buildJugadorHomeOrgMapFromParticipaciones,
  computeCareerPointsByClubFromParticipaciones,
  sortCareerClubsForDisplay,
} from "./careerPointsByClub";
import type { CareerPointsByClubResult } from "./careerPointsByClub";
import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import {
  resolvePlayerCareer,
  resolvePlayerPoints,
} from "./playerIdentityService";
import type { ResolvedPlayerIdentity } from "./playerIdentityService";
import { resolveOfficialGlobalPuntos } from "./rivieraOfficialActivity";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

export type PlayerPointsBreakdownClub = {
  organizador_id: string;
  /** Hint opcional; la UI debe resolver el label por organizador_id (caché/RPC). */
  club_name: string;
  points: number;
};

export type PlayerPointsBreakdown = {
  currentClubPoints: number;
  /** Suma local en todos los clubes (carrera); nunca es el ledger ROMC. */
  careerTotalAllClubs: number;
  /** Puntos ledger ROMC; null = sin identidad oficial / RPC no disponible. */
  officialGlobalPoints: number | null;
  pointsByClub: PlayerPointsBreakdownClub[];
};

/** Vista de carrera local (sin ROMC) para desglose por club. */
export type CareerPointsBreakdownView = Pick<
  PlayerPointsBreakdown,
  "currentClubPoints" | "careerTotalAllClubs" | "pointsByClub"
>;

export function breakdownFromCareerResult(
  career: CareerPointsByClubResult,
  currentOrganizadorId: string | null | undefined
): CareerPointsBreakdownView {
  const viewOrg = currentOrganizadorId?.trim() || null;
  const byClub = sortCareerClubsForDisplay(career.byClub, viewOrg);

  const pointsByClub: PlayerPointsBreakdownClub[] = byClub
    .filter((entry) => entry.puntos > 0 || entry.organizadorId === viewOrg)
    .map((entry) => ({
      organizador_id: entry.organizadorId,
      // Solo nombre ya resuelto en caché; nunca stamp del fallback madre.
      club_name: getCachedOrganizerDisplayName(entry.organizadorId) ?? "",
      points: entry.puntos,
    }));

  const currentClubPoints = viewOrg
    ? career.puntosByOrg.get(viewOrg) ?? 0
    : career.total;

  return {
    currentClubPoints,
    careerTotalAllClubs: career.total,
    pointsByClub,
  };
}

export function careerResultFromJugador(
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

async function resolveOfficialGlobalPointsForJugador(
  jugador: RivieraJugadorWithStats
): Promise<number | null> {
  if (jugador.officialPuntosGlobal != null && Number.isFinite(jugador.officialPuntosGlobal)) {
    return jugador.officialPuntosGlobal;
  }
  return resolveOfficialGlobalPuntos(jugador.id);
}

async function withOfficialGlobalPoints(
  jugador: RivieraJugadorWithStats,
  breakdown: CareerPointsBreakdownView
): Promise<PlayerPointsBreakdown> {
  return {
    ...breakdown,
    officialGlobalPoints: await resolveOfficialGlobalPointsForJugador(jugador),
  };
}

export type ResolvePlayerPointsBreakdownInput = {
  jugador: RivieraJugadorWithStats;
  identity?: ResolvedPlayerIdentity | null;
  currentOrganizadorId: string | null;
  participaciones?: JugadorParticipacion[];
};

/**
 * Única fuente de verdad para puntos por club / total carrera / ROMC oficial.
 */
export async function resolvePlayerPointsBreakdown(
  input: ResolvePlayerPointsBreakdownInput
): Promise<PlayerPointsBreakdown> {
  const { jugador, identity, currentOrganizadorId, participaciones } = input;
  const viewOrg = currentOrganizadorId?.trim() || null;

  if (participaciones?.length) {
    const linkedIds = Array.from(
      new Set(
        [
          jugador.id,
          jugador.grantedAccess?.sourceJugadorId,
          ...(identity?.linkedJugadorIds ?? []),
        ]
          .map((id) => id?.trim())
          .filter(Boolean) as string[]
      )
    );
    const enriched = await enrichParticipacionesOrganizadorFromEvents(
      participaciones
    );
    const homeMap = await buildJugadorHomeOrgMapFromParticipaciones(
      enriched,
      linkedIds
    );
    const career = computeCareerPointsByClubFromParticipaciones(enriched, {
      jugadorHomeOrgById: homeMap,
      viewingOrganizadorId: viewOrg,
      includeViewingOrgWithZero: Boolean(viewOrg),
    });
    return withOfficialGlobalPoints(
      jugador,
      breakdownFromCareerResult(career, viewOrg)
    );
  }

  if (identity) {
    const careerBundle = await resolvePlayerCareer(identity, 500);
    const career = await resolvePlayerPoints(identity, careerBundle);
    return withOfficialGlobalPoints(
      jugador,
      breakdownFromCareerResult(career, viewOrg)
    );
  }

  const existing = careerResultFromJugador(jugador);
  if (existing && (existing.total > 0 || existing.byClub.length > 0)) {
    return withOfficialGlobalPoints(
      jugador,
      breakdownFromCareerResult(existing, viewOrg)
    );
  }

  const enrichedJugador = await attachCareerPuntosToJugador(jugador, {
    viewingOrganizadorId: viewOrg,
    includeViewingOrgWithZero: Boolean(viewOrg),
  });

  const career = careerResultFromJugador(enrichedJugador);
  if (!career) {
    return withOfficialGlobalPoints(jugador, {
      currentClubPoints: jugador.stats?.puntos_totales ?? 0,
      careerTotalAllClubs: jugador.stats?.puntos_totales ?? 0,
      pointsByClub: viewOrg
        ? [
            {
              organizador_id: viewOrg,
              club_name: getCachedOrganizerDisplayName(viewOrg) ?? "",
              points: jugador.stats?.puntos_totales ?? 0,
            },
          ]
        : [],
    });
  }

  return withOfficialGlobalPoints(
    enrichedJugador,
    breakdownFromCareerResult(career, viewOrg)
  );
}
