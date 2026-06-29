import {
  getManifestByKey,
  resolveBrandingKeyForOrganizador,
  RIVIERA_PRODUCT_NAME,
} from "../../club-experience";
import { rankingPuntosJugador } from "./rankingPosition";
import type { RivieraJugadorWithStats } from "./types";

export function getOrganizadorClubDisplayName(
  organizadorId: string | null | undefined
): string {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;
  const key = resolveBrandingKeyForOrganizador(organizadorId);
  return getManifestByKey(key)?.displayName ?? RIVIERA_PRODUCT_NAME;
}

export function rankingPuntosOrigenConcedido(j: RivieraJugadorWithStats): number {
  return j.statsOrigenConcedido?.puntos_totales ?? 0;
}

export function hasDualRankingConcedido(j: RivieraJugadorWithStats): boolean {
  return Boolean(j.concedidoPorAdmin && j.grantedAccess?.sourceJugadorId);
}

/** Puntos mostrados en el registro interno (lista de jugadores del club). */
export function rankingPuntosJugadorLista(j: RivieraJugadorWithStats): number {
  if (j.concedidoPorAdmin && j.statsOrigenConcedido) {
    return rankingPuntosOrigenConcedido(j);
  }
  return rankingPuntosJugador(j);
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
