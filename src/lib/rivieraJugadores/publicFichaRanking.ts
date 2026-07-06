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
  options: {
    orgId?: string | null;
    /** @deprecated Usar preferClubRanking */
    internalClub?: boolean;
    /** Org en URL: mostrar ranking del club actual. */
    preferClubRanking?: boolean;
  }
): PublicFichaRankingTarget {
  const org = options.orgId?.trim();
  const preferClub =
    options.preferClubRanking ?? options.internalClub ?? false;
  if (org && preferClub) return "club";
  if (isJugadorPublicadoSitioOficial(jugador)) return "global";
  if (org) return "club";
  return "none";
}

export function rankingLabelForPublicFicha(
  jugador: Pick<RivieraJugadorWithStats, "visible_publico" | "estado" | "suma_ranking">,
  hasOrgContext = false
): string {
  if (hasOrgContext) return "Ranking";
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
