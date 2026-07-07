import { enrichJugadorConcedidoClubView } from "./concedidoClubView";
import {
  loadUnifiedParticipacionesForJugador,
  loadUnifiedRatingViewForJugador,
} from "./grantedPlayerUnifiedView";
import {
  buildMulticlubGranteePuntosFromParticipaciones,
  filterHomeClubHistorial,
  filterOtherClubHistorial,
} from "./nativeMulticlubHomeView";
import {
  enrichParticipacionesOrganizadorFromEvents,
  filterParticipacionesForOrganizador,
} from "./participacionesOrganizadorScope";
import { resolveOfficialGlobalPuntos } from "./rivieraOfficialActivity";
import { computeJugadorStatsFromParticipaciones } from "./rebuildJugadorStats";
import type { RatingRpcFallbackOptions } from "./ratingRpcErrors";
import type {
  JugadorParticipacion,
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "./types";

export type PlayerClubDisplayResult = {
  jugador: RivieraJugadorWithStats;
  historial: JugadorParticipacion[];
  historialOtrosClubes: JugadorParticipacion[];
  historialRating: RatingHistorialEntry[];
};

/**
 * Vista unificada: rating, puntos e historial scoped al club anfitrión.
 */
export async function loadOrganizerScopedPlayerView(
  organizadorId: string,
  jugador: RivieraJugadorWithStats,
  options: {
    listParticipaciones: (
      jugadorId: string,
      limit: number,
      orgId: string
    ) => Promise<JugadorParticipacion[]>;
    fetchParticipacionesRaw: (
      jugadorId: string,
      limit: number
    ) => Promise<JugadorParticipacion[]>;
    fetchHistorialRating: (
      jugadorId: string,
      limite: number
    ) => Promise<RatingHistorialEntry[]>;
    ratingRpc?: RatingRpcFallbackOptions;
    historialLimit?: number;
    ratingLimit?: number;
  }
): Promise<PlayerClubDisplayResult> {
  const org = organizadorId.trim();
  const limit = options.historialLimit ?? 100;
  let jugadorBase = await enrichJugadorConcedidoClubView(org, jugador, {
    rpc: options.ratingRpc,
  });

  const homeOrg = jugadorBase.organizador_id?.trim() ?? org;
  const isNativeHome = homeOrg === org && !jugadorBase.concedidoPorAdmin;

  const unified = await loadUnifiedParticipacionesForJugador(jugadorBase, {
    limit,
    organizadorId: org,
    scopedToOrganizadorHistorial: true,
    listParticipaciones: (id, lim, organizador) =>
      options.listParticipaciones(id, lim, organizador ?? org),
  });

  const enrichedRows = await enrichParticipacionesOrganizadorFromEvents(
    unified.historial
  );

  const allRawEnriched = isNativeHome
    ? await enrichParticipacionesOrganizadorFromEvents(
        await options.fetchParticipacionesRaw(jugadorBase.id, limit)
      )
    : enrichedRows;

  const historial = isNativeHome
    ? filterHomeClubHistorial(allRawEnriched, homeOrg)
    : filterParticipacionesForOrganizador(enrichedRows, org, {
        jugadorHomeOrganizadorId: homeOrg,
      });

  const historialOtrosClubes = isNativeHome
    ? filterOtherClubHistorial(allRawEnriched, homeOrg)
    : [];

  jugadorBase = await enrichJugadorConcedidoClubView(org, jugadorBase, {
    rpc: options.ratingRpc,
  });

  if (isNativeHome) {
    const multiclubGranteePuntos = buildMulticlubGranteePuntosFromParticipaciones(
      jugadorBase.id,
      allRawEnriched,
      homeOrg
    );
    if (multiclubGranteePuntos.length > 0) {
      const officialGlobal = await resolveOfficialGlobalPuntos(jugadorBase.id);
      jugadorBase = {
        ...jugadorBase,
        multiclubGranteePuntos,
        ...(officialGlobal != null ? { officialPuntosGlobal: officialGlobal } : {}),
      };
    }
  }

  const ratingView = await loadUnifiedRatingViewForJugador(jugadorBase, {
    limite: options.ratingLimit ?? 10,
    organizadorId: org,
    participacionesHistorial: historial,
    fetchHistorial: options.fetchHistorialRating,
    rpc: options.ratingRpc,
  });

  jugadorBase = {
    ...jugadorBase,
    rating: ratingView.jugador.rating,
    rating_partidos: ratingView.jugador.rating_partidos,
    rating_fiabilidad: ratingView.jugador.rating_fiabilidad,
  };

  const statsBase = jugadorBase.stats;
  if (statsBase && historial.length > 0) {
    const scopedStats = computeJugadorStatsFromParticipaciones(
      jugadorBase.id,
      historial,
      org
    );
    jugadorBase = {
      ...jugadorBase,
      stats: {
        ...statsBase,
        ...scopedStats,
        puntos_totales: Math.max(
          statsBase.puntos_totales ?? 0,
          scopedStats.puntos_totales ?? 0
        ),
        updated_at: statsBase.updated_at,
      },
    };
  }

  return {
    jugador: jugadorBase,
    historial,
    historialOtrosClubes,
    historialRating: ratingView.historial,
  };
}
