import { attachCareerPuntosToJugador } from "./careerPointsByClub";
import {
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
  // TEMPORAL (medición Fase 2-3) — retirar en Fase 8.
  __getCareerIdentityCacheDevStats,
  __resetCareerIdentityCacheDevStats,
} from "./careerIdentityCache";
import {
  resolvePlayerCareer,
  resolvePlayerIdentity,
} from "./playerIdentityService";
import { resolvePlayerPointsBreakdown } from "./playerPointsBreakdown";
import { logRankingPointsAudit, snapshotFromBreakdown } from "./rankingPointsAudit";
import type { RivieraJugadorWithStats } from "./types";
// TEMPORAL (medición Fase 2-3) — retirar en Fase 8.
import { debugLog } from "../debug/debugLog";

const DEV = process.env.NODE_ENV !== "production";

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

  // TEMPORAL (medición Fase 2-3) — retirar en Fase 8. No cambia el orden ni
  // la concurrencia de Promise.all, solo mide alrededor de la misma llamada.
  // Nota: si dos cargas se superponen (p. ej. JugadoresLista + ranking
  // interno en simultáneo), el reset de una puede pisar el conteo de la
  // otra — para medir limpio, correr una vista a la vez.
  if (DEV) __resetCareerIdentityCacheDevStats();
  const t0 = DEV ? performance.now() : 0;

  const result = await Promise.all(
    jugadores.map(async (j) => enrichJugadorOrganizerScopedStats(org, j))
  );

  if (DEV) {
    const totalMs = performance.now() - t0;
    const stats = __getCareerIdentityCacheDevStats();
    const count = jugadores.length;
    debugLog("[career-cache] enrich-summary", {
      jugadores: count,
      hits: stats.hits,
      misses: stats.misses,
      dedupeHits: stats.dedupeHits,
      expired: stats.expired,
      loadersEjecutados: stats.loaderCalls,
      totalMs: Math.round(totalMs),
      avgMsPorJugador: count > 0 ? Math.round(totalMs / count) : 0,
    });
  }

  return result;
}

/**
 * Resuelve identity + carrera global, cacheado por (organizadorId, jugadorId)
 * vía careerIdentityCache. Todo lo posterior (attachCareerPuntosToJugador,
 * resolvePlayerPointsBreakdown) sigue ejecutándose siempre, sin caché — solo
 * se evita repetir la cadena de RPC/queries de identidad+carrera.
 */
async function resolveCareerIdentityBundleCached(
  organizadorId: string,
  jugadorId: string
): Promise<CareerIdentityBundle | null> {
  return getOrLoadCareerIdentityBundle(organizadorId, jugadorId, async () => {
    const identity = await resolvePlayerIdentity(
      { kind: "jugadorId", jugadorId },
      organizadorId
    );
    if (!identity) return null;
    const careerBundle = await resolvePlayerCareer(identity, 500);
    return { identity, participaciones: careerBundle.participaciones };
  });
}

async function enrichJugadorOrganizerScopedStats(
  organizadorId: string,
  jugador: RivieraJugadorWithStats
): Promise<RivieraJugadorWithStats> {
  const cached = await resolveCareerIdentityBundleCached(organizadorId, jugador.id);

  if (cached) {
    const { identity, participaciones: historialGlobal } = cached;

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
