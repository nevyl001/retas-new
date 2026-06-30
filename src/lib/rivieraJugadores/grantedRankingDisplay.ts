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

/** Total efectivo para ranking y cards (ROMC global; sin doble conteo multiclub). */
export function rankingPuntosGlobalDisplay(j: RivieraJugadorWithStats): number {
  return resolveJugadorPuntosRanking(j);
}

export function hasDualRankingConcedido(j: RivieraJugadorWithStats): boolean {
  return Boolean(j.concedidoPorAdmin && j.grantedAccess?.sourceJugadorId);
}

/** Puntos mostrados en el registro interno (lista de jugadores del club). */
export function rankingPuntosJugadorLista(j: RivieraJugadorWithStats): number {
  return resolveJugadorPuntosRanking(j);
}

export function jugadorListaPartidosDisplay(j: RivieraJugadorWithStats): number {
  if (hasDualRankingConcedido(j)) {
    return Math.max(
      j.stats?.total_partidos ?? 0,
      j.statsOrigenConcedido?.total_partidos ?? 0
    );
  }
  return j.stats?.total_partidos ?? 0;
}

export function jugadorListaPctVictoriasDisplay(j: RivieraJugadorWithStats): string {
  const partidos = jugadorListaPartidosDisplay(j);
  if (!partidos) return "—";
  if (hasDualRankingConcedido(j)) {
    const victorias = Math.max(
      j.stats?.victorias ?? 0,
      j.statsOrigenConcedido?.victorias ?? 0
    );
    const perdidas = Math.max(
      j.stats?.derrotas ?? 0,
      j.statsOrigenConcedido?.derrotas ?? 0
    );
    const decididos = victorias + perdidas;
    if (!decididos) return "—";
    return `${Math.round((victorias / decididos) * 100)}%`;
  }
  const s = j.stats;
  if (!s?.total_partidos) return "—";
  return `${Number(s.pct_victorias).toFixed(0)}%`;
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
