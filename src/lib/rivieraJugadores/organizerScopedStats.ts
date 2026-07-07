import { attachCareerPuntosToJugador } from "./careerPointsByClub";
import {
  breakdownFromCareerResult,
  careerResultFromJugador,
} from "./playerPointsBreakdown";
import { logRankingPointsAudit, snapshotFromBreakdown } from "./rankingPointsAudit";
import type { RivieraJugadorWithStats } from "./types";

/**
 * Enriquece filas del ranking con carrera global por club (todos los perfiles).
 * Usa la misma fuente canónica que la ficha pública.
 */
export async function enrichJugadoresOrganizerScopedStats(
  organizadorId: string,
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  const org = organizadorId.trim();
  if (!org || jugadores.length === 0) return jugadores;

  return Promise.all(
    jugadores.map(async (j) => {
      const enriched = await attachCareerPuntosToJugador(j, {
        viewingOrganizadorId: org,
        includeViewingOrgWithZero: true,
      });

      const career = careerResultFromJugador(enriched);
      if (!career) return enriched;

      const breakdown = breakdownFromCareerResult(career, org);
      logRankingPointsAudit(
        "organizerScopedStats.enrichJugadoresOrganizerScopedStats",
        enriched,
        snapshotFromBreakdown(breakdown, org),
        { viewingOrganizadorId: org }
      );
      return {
        ...enriched,
        pointsBreakdown: breakdown,
      };
    })
  );
}
