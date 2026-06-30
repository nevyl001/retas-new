import { getOrganizerDisplayNameSync, resolveOrganizerDisplayName } from "../organizer/organizerDisplayName";
import {
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

/** Puntos mostrados en tarjeta del ranking interno del club (solo este club). */
export function rankingPuntosInternoClubDisplay(j: RivieraJugadorWithStats): number {
  return rankingPuntosClubLocal(j);
}

/** Total global / sitio oficial (cedidos: local + origen). */
export function rankingPuntosGlobalDisplay(j: RivieraJugadorWithStats): number {
  if (j.officialPuntosGlobal != null && Number.isFinite(j.officialPuntosGlobal)) {
    return j.officialPuntosGlobal;
  }
  if (hasDualRankingConcedido(j)) {
    return (j.stats?.puntos_totales ?? 0) + rankingPuntosOrigenConcedido(j);
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
  return j.grantedAccess?.ownerOrganizadorId?.trim() || null;
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
