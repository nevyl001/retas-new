import type { RivieraJugadorWithStats } from "./types";

export type PublicFichaRankingTarget = "global" | "club" | "none";

/** Jugador publicado en rivieraopen.com/rankings (todos los clubes). */
export function isJugadorPublicadoSitioOficial(
  jugador: Pick<
    RivieraJugadorWithStats,
    "visible_publico" | "estado" | "suma_ranking"
  >
): boolean {
  return (
    jugador.visible_publico === true &&
    jugador.estado === "activo" &&
    jugador.suma_ranking !== false
  );
}

/**
 * ¿De qué ranking sale el # en la ficha pública?
 * - global: rivieraopen.com (todos los clubes con sitio oficial)
 * - club: ranking interno del organizador (solo jugadores del club)
 */
export function resolvePublicFichaRankingTarget(
  jugador: Pick<
    RivieraJugadorWithStats,
    "visible_publico" | "estado" | "suma_ranking"
  >,
  options: { orgId?: string | null }
): PublicFichaRankingTarget {
  if (isJugadorPublicadoSitioOficial(jugador)) return "global";
  if (options.orgId?.trim()) return "club";
  return "none";
}

export function rankingLabelForPublicFicha(
  jugador: Pick<RivieraJugadorWithStats, "visible_publico" | "estado" | "suma_ranking">
): string {
  return isJugadorPublicadoSitioOficial(jugador)
    ? "Ranking Riviera Open"
    : "Ranking";
}

/** Puntos mostrados en hero de ficha: global si sitio oficial, locales si solo club interno. */
export function shouldUseClubLocalPuntosOnPublicFicha(
  jugador: Pick<
    RivieraJugadorWithStats,
    "visible_publico" | "estado" | "suma_ranking"
  >,
  internalClub: boolean
): boolean {
  return internalClub && !isJugadorPublicadoSitioOficial(jugador);
}
