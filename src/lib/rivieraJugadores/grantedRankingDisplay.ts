import { getOrganizerDisplayNameSync, resolveOrganizerDisplayName } from "../organizer/organizerDisplayName";
import {
  isJugadorConcedidoEnClub,
  rankingPuntosClubLocal,
  resolveJugadorPuntosRanking,
} from "./rankingPosition";
import type { RivieraJugadorWithStats } from "./types";

export function getOrganizadorClubDisplayName(
  organizadorId: string | null | undefined
): string {
  return getOrganizerDisplayNameSync(organizadorId);
}

export function rankingPuntosOrigenConcedido(j: RivieraJugadorWithStats): number {
  return j.statsOrigenConcedido?.puntos_totales ?? 0;
}

/**
 * Puntos de carrera Riviera (todos los clubes) para la fila del club de registro.
 * Ej.: cedido con 20 pts en Hackpadel y 0 en el registro origen → 20.
 */
export function rankingPuntosCarreraRivieraDisplay(
  j: RivieraJugadorWithStats
): number {
  if (j.officialPuntosGlobal != null && Number.isFinite(j.officialPuntosGlobal)) {
    return j.officialPuntosGlobal;
  }
  if (hasDualRankingConcedido(j)) {
    return (j.stats?.puntos_totales ?? 0) + rankingPuntosOrigenConcedido(j);
  }
  return resolveJugadorPuntosRanking(j);
}

/** Puntos mostrados en tarjeta del ranking interno del club (solo este club). */
export function rankingPuntosInternoClubDisplay(j: RivieraJugadorWithStats): number {
  return rankingPuntosClubLocal(j);
}

/** Total global / sitio oficial (cedidos: carrera en todos los clubes). */
export function rankingPuntosGlobalDisplay(j: RivieraJugadorWithStats): number {
  if (j.officialPuntosGlobal != null && Number.isFinite(j.officialPuntosGlobal)) {
    return j.officialPuntosGlobal;
  }
  if (hasDualRankingConcedido(j)) {
    return rankingPuntosCarreraRivieraDisplay(j);
  }
  return resolveJugadorPuntosRanking(j);
}

export function sortJugadoresByGlobalDisplayPuntos(
  jugadores: RivieraJugadorWithStats[]
): RivieraJugadorWithStats[] {
  return [...jugadores].sort((a, b) => {
    const pa = rankingPuntosGlobalDisplay(a);
    const pb = rankingPuntosGlobalDisplay(b);
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function rankingPosicionesFromGlobalDisplay(
  jugadores: RivieraJugadorWithStats[]
): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < jugadores.length; i++) {
    const pts = rankingPuntosGlobalDisplay(jugadores[i]);
    const prevPts = i > 0 ? rankingPuntosGlobalDisplay(jugadores[i - 1]) : null;
    if (i === 0 || pts !== prevPts) {
      ranks.push(i + 1);
    } else {
      ranks.push(ranks[i - 1]!);
    }
  }
  return ranks;
}

export function hasDualRankingConcedido(j: RivieraJugadorWithStats): boolean {
  return Boolean(j.concedidoPorAdmin && j.grantedAccess?.sourceJugadorId);
}

/** Puntos en registro y ranking interno del club anfitrión. */
export function rankingPuntosJugadorLista(j: RivieraJugadorWithStats): number {
  return rankingPuntosClubLocal(j);
}

export function jugadorListaPartidosDisplay(j: RivieraJugadorWithStats): number {
  return j.stats?.total_partidos ?? 0;
}

export function jugadorListaPctVictoriasDisplay(j: RivieraJugadorWithStats): string {
  const s = j.stats;
  if (!s?.total_partidos) return "—";
  return `${Number(s.pct_victorias).toFixed(0)}%`;
}

export function resolveOrigenConcedidoOrganizadorId(
  j: RivieraJugadorWithStats
): string | null {
  const fromGrant = j.grantedAccess?.ownerOrganizadorId?.trim();
  if (fromGrant) return fromGrant;

  if (
    isJugadorConcedidoEnClub(j) &&
    j.grantedAccess?.sourceJugadorId &&
    j.id === j.grantedAccess.sourceJugadorId
  ) {
    const ownerFromRow = j.organizador_id?.trim();
    if (ownerFromRow) return ownerFromRow;
  }

  return null;
}

/** Precarga nombres reales de clubes (users.name vía RPC) para cedidos en ranking/ficha. */
export async function prefetchOrganizerDisplayNames(
  ids: Array<string | null | undefined>
): Promise<void> {
  const unique = Array.from(
    new Set(
      ids
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id))
    )
  );
  await Promise.all(unique.map((id) => resolveOrganizerDisplayName(id)));
}
