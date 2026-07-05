import { resolveOrigenConcedidoOrganizadorId } from "./grantedRankingDisplay";
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
  options: { orgId?: string | null; internalClub?: boolean }
): PublicFichaRankingTarget {
  if (options.internalClub && options.orgId?.trim()) return "club";
  if (isJugadorPublicadoSitioOficial(jugador)) return "global";
  if (options.orgId?.trim()) return "club";
  return "none";
}

export function rankingLabelForPublicFicha(
  jugador: Pick<RivieraJugadorWithStats, "visible_publico" | "estado" | "suma_ranking">,
  internalClub = false
): string {
  if (internalClub) return "Ranking";
  return isJugadorPublicadoSitioOficial(jugador)
    ? "Ranking Riviera Open"
    : "Ranking";
}

/** Club de registro (origen del jugador), no el anfitrión desde el que se abre la ficha. */
export function resolveRegistrationOrganizadorIdForPublicFicha(
  jugador: RivieraJugadorWithStats
): string | null {
  return (
    resolveOrigenConcedidoOrganizadorId(jugador) ??
    jugador.organizador_id?.trim() ??
    null
  );
}

/** Ficha desde ranking interno del club: solo puntos ganados en ese organizador. */
export function shouldUseClubLocalPuntosOnPublicFicha(
  jugador: Pick<
    RivieraJugadorWithStats,
    "visible_publico" | "estado" | "suma_ranking"
  >,
  internalClub: boolean
): boolean {
  void jugador;
  return internalClub;
}
