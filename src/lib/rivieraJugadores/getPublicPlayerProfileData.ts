import { enrichJugadorConcedidoClubView } from "./concedidoClubView";
import {
  loadUnifiedParticipacionesForJugador,
  loadUnifiedRatingViewForJugador,
} from "./grantedPlayerUnifiedView";
import {
  enrichNativeMulticlubHomeClubView,
  filterHomeClubHistorial,
  filterOtherClubHistorial,
} from "./nativeMulticlubHomeView";
import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import { mergeJugadorStatsPuntosTotales } from "./rankingPosition";
import type { RatingRpcFallbackOptions } from "./ratingRpcErrors";
import {
  getRivieraJugadorInternalClubById,
  getRivieraJugadorPublicById,
  getRivieraJugadorPublicBySlug,
  listParticipaciones,
  listParticipacionesPublic,
  obtenerHistorialRating,
  obtenerHistorialRatingPublic,
  resolveRankingPosicionForPublicFicha,
} from "./rivieraJugadoresService";
import type {
  JugadorParticipacion,
  JugadorStats,
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "./types";

export type PublicPlayerProfileData = {
  jugador: RivieraJugadorWithStats;
  /** Org en URL (?org= o /ranking/o/) — branding y ranking/puntos locales. */
  viewingOrgId: string | null;
  hasOrgContext: boolean;
  localRankingPos: number | null;
  /** Carrera completa (todos los clubes). */
  historialGlobal: JugadorParticipacion[];
  /** Lista principal en UI (home club si hay split; si no, global). */
  historialMain: JugadorParticipacion[];
  historialOtrosClubes: JugadorParticipacion[];
  historialRating: RatingHistorialEntry[];
};

export type GetPublicPlayerProfileDataParams = {
  playerId?: string;
  slug?: string;
  viewingOrgId: string | null;
  isAuthenticated: boolean;
  ratingRpc?: RatingRpcFallbackOptions;
  historialLimit?: number;
};

function emptyStats(jugadorId: string): JugadorStats {
  return {
    jugador_id: jugadorId,
    total_partidos: 0,
    victorias: 0,
    derrotas: 0,
    empates: 0,
    participaciones_solo: 0,
    pct_victorias: 0,
    total_retas: 0,
    total_torneos_express: 0,
    total_ligas: 0,
    total_americanos: 0,
    sets_favor_total: 0,
    sets_contra_total: 0,
    racha_actual: "",
    ultima_actividad: null,
    puntos_totales: 0,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Carga unificada de ficha pública: carrera global por Riviera ID.
 * `viewingOrgId` solo afecta branding, ranking local y puntos locales.
 */
export async function getPublicPlayerProfileData(
  params: GetPublicPlayerProfileDataParams
): Promise<PublicPlayerProfileData | null> {
  const {
    playerId,
    slug,
    viewingOrgId,
    isAuthenticated,
    ratingRpc,
    historialLimit = 100,
  } = params;

  const org = viewingOrgId?.trim() || null;
  const hasOrgContext = Boolean(org);

  let jugador =
    playerId && org
      ? (await getRivieraJugadorInternalClubById(playerId, org)) ??
        (await getRivieraJugadorPublicById(playerId))
      : playerId
      ? await getRivieraJugadorPublicById(playerId)
      : await getRivieraJugadorPublicBySlug(slug ?? "", org ?? undefined);

  if (!jugador) return null;

  if (playerId && org && jugador.organizador_id !== org) {
    const internalRow = await getRivieraJugadorInternalClubById(playerId, org);
    if (internalRow) jugador = internalRow;
  }

  if (org) {
    jugador = await enrichJugadorConcedidoClubView(org, jugador, { rpc: ratingRpc });
  }

  const fetchParticipaciones = (id: string, limit: number) =>
    isAuthenticated
      ? listParticipaciones(id, limit)
      : listParticipacionesPublic(id, limit);

  const fetchHistorial = isAuthenticated
    ? obtenerHistorialRating
    : obtenerHistorialRatingPublic;

  const unified = await loadUnifiedParticipacionesForJugador(jugador, {
    limit: historialLimit,
    organizadorId: null,
    scopedToOrganizadorHistorial: false,
    listParticipaciones: (id, lim) => fetchParticipaciones(id, lim),
  });

  const historialGlobal = unified.historial;
  const puntosOficialEfectivos = unified.romcView.hasRomcData
    ? unified.romcView.puntosOficiales
    : null;

  const homeOrg = jugador.organizador_id?.trim() ?? null;
  const useHistorialSplit =
    Boolean(org && homeOrg && homeOrg === org && !jugador.concedidoPorAdmin);

  let historialMain = historialGlobal;
  let historialOtrosClubes: JugadorParticipacion[] = [];

  if (useHistorialSplit && homeOrg) {
    const enriched = await enrichParticipacionesOrganizadorFromEvents(historialGlobal);
    historialMain = filterHomeClubHistorial(enriched, homeOrg);
    historialOtrosClubes = filterOtherClubHistorial(enriched, homeOrg);
    jugador = await enrichNativeMulticlubHomeClubView(org!, jugador, {
      fetchParticipaciones: (id, lim) => fetchParticipaciones(id, lim),
      participacionesLimit: historialLimit,
    });
  }

  const ratingView = await loadUnifiedRatingViewForJugador(jugador, {
    limite: 10,
    organizadorId: null,
    participacionesHistorial: historialGlobal,
    fetchHistorial,
    rpc: hasOrgContext ? ratingRpc : undefined,
  });

  jugador = ratingView.jugador;

  const statsBase = jugador.stats ?? emptyStats(jugador.id);

  if (!hasOrgContext) {
    jugador = {
      ...jugador,
      stats: mergeJugadorStatsPuntosTotales(statsBase, puntosOficialEfectivos),
      officialPuntosGlobal:
        puntosOficialEfectivos ?? jugador.officialPuntosGlobal,
    };
  }

  const localRankingPos = await resolveRankingPosicionForPublicFicha(jugador, {
    orgId: org,
    preferClubRanking: hasOrgContext,
  });

  return {
    jugador,
    viewingOrgId: org,
    hasOrgContext,
    localRankingPos,
    historialGlobal,
    historialMain,
    historialOtrosClubes,
    historialRating: ratingView.historial,
  };
}
