import { attachCareerPuntosToJugador } from "./careerPointsByClub";
import {
  resolvePlayerCareer,
  resolvePlayerIdentity,
} from "./playerIdentityService";
import { resolvePlayerPointsBreakdown } from "./playerPointsBreakdown";
import { logRankingPointsAudit, snapshotFromBreakdown } from "./rankingPointsAudit";
import type { RivieraJugadorWithStats } from "./types";

/**
 * Enriquece filas del ranking con carrera global por club (todos los perfiles).
 * Usa el mismo motor de identidad que la ficha pública — nunca stats locales parciales.
 */
export async function enrichJugadoresOrganizerScopedStats(
  organizadorId: string,
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  const org = organizadorId.trim();
  if (!org || jugadores.length === 0) return jugadores;

  return Promise.all(
    jugadores.map(async (j) => enrichJugadorOrganizerScopedStats(org, j))
  );
}

async function enrichJugadorOrganizerScopedStats(
  organizadorId: string,
  jugador: RivieraJugadorWithStats
): Promise<RivieraJugadorWithStats> {
  const identity = await resolvePlayerIdentity(
    { kind: "jugadorId", jugadorId: jugador.id },
    organizadorId
  );

  if (identity) {
    const careerBundle = await resolvePlayerCareer(identity, 500);
    const historialGlobal = careerBundle.participaciones;

    const careerJugador = await attachCareerPuntosToJugador(jugador, {
      linkedJugadorIds: identity.linkedJugadorIds,
      participaciones: historialGlobal,
      viewingOrganizadorId: organizadorId,
      includeViewingOrgWithZero: true,
    });

    const pointsBreakdown = await resolvePlayerPointsBreakdown({
      jugador: careerJugador,
      identity,
      currentOrganizadorId: organizadorId,
      participaciones: historialGlobal,
    });

    logRankingPointsAudit(
      "organizerScopedStats.enrichJugadoresOrganizerScopedStats",
      careerJugador,
      snapshotFromBreakdown(pointsBreakdown, organizadorId),
      { viewingOrganizadorId: organizadorId, source: "identity_motor" }
    );

    return {
      ...careerJugador,
      pointsBreakdown,
    };
  }

  const enriched = await attachCareerPuntosToJugador(jugador, {
    viewingOrganizadorId: organizadorId,
    includeViewingOrgWithZero: true,
  });

  const pointsBreakdown = await resolvePlayerPointsBreakdown({
    jugador: enriched,
    currentOrganizadorId: organizadorId,
  });

  logRankingPointsAudit(
    "organizerScopedStats.enrichJugadoresOrganizerScopedStats",
    enriched,
    snapshotFromBreakdown(pointsBreakdown, organizadorId),
    { viewingOrganizadorId: organizadorId, source: "legacy_anchor" }
  );

  return {
    ...enriched,
    pointsBreakdown,
  };
}
