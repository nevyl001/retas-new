import {
  getManifestByKey,
  resolveBrandingKeyForOrganizador,
  RIVIERA_PRODUCT_NAME,
} from "../../club-experience";
import { getCachedOrganizerDisplayName } from "../organizer/organizerDisplayName";
import { resolveJugadorPuntosRanking } from "./rankingPosition";
import type { RivieraJugadorWithStats } from "./types";

export function getOrganizadorClubDisplayName(
  organizadorId: string | null | undefined
): string {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;
  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;
  const key = resolveBrandingKeyForOrganizador(organizadorId);
  return getManifestByKey(key)?.displayName ?? RIVIERA_PRODUCT_NAME;
}

export function rankingPuntosOrigenConcedido(j: RivieraJugadorWithStats): number {
  return j.statsOrigenConcedido?.puntos_totales ?? 0;
}

/** Total global ROMC para ranking (todos los clubes). */
export function rankingPuntosGlobalDisplay(j: RivieraJugadorWithStats): number {
  if (hasDualRankingConcedido(j)) {
    return (j.stats?.puntos_totales ?? 0) + rankingPuntosOrigenConcedido(j);
  }
  return resolveJugadorPuntosRanking(j);
}

export function hasDualRankingConcedido(j: RivieraJugadorWithStats): boolean {
  return Boolean(j.concedidoPorAdmin && j.grantedAccess?.sourceJugadorId);
}

/** Puntos mostrados en el registro interno (lista de jugadores del club). */
export function rankingPuntosJugadorLista(j: RivieraJugadorWithStats): number {
  if (j.concedidoPorAdmin && j.statsOrigenConcedido) {
    return rankingPuntosOrigenConcedido(j);
  }
  return resolveJugadorPuntosRanking(j);
}

export function resolveOrigenConcedidoOrganizadorId(
  j: RivieraJugadorWithStats
): string | null {
  return (
    j.grantedAccess?.ownerOrganizadorId?.trim() ||
    (j.concedidoPorAdmin ? j.organizador_id?.trim() : null) ||
    null
  );
}
