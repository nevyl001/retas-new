import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import {
  hasDualRankingConcedido,
  rankingPuntosGlobalDisplay,
  rankingPuntosInternoClubDisplay,
  rankingPuntosOrigenConcedido,
  resolveOrigenConcedidoOrganizadorId,
} from "./grantedRankingDisplay";
import {
  isNativeMulticlubHomeRankingDisplay,
  nativeMulticlubCareerPuntosTotal,
} from "./nativeMulticlubHomeView";
import type { RivieraJugadorWithStats } from "./types";

export type JugadorPuntosBreakdownLine = {
  key: string;
  clubLabel: string;
  puntos: number;
  role: "home" | "other" | "total";
};

export function simpleJugadorPuntosDisplay(
  jugador: RivieraJugadorWithStats,
  internalClub = false
): number {
  return internalClub
    ? rankingPuntosInternoClubDisplay(jugador)
    : rankingPuntosGlobalDisplay(jugador);
}

/**
 * Líneas: otros clubes → club actual → Total Riviera.
 * Vacío = un solo número en UI.
 */
export function buildJugadorPuntosBreakdown(
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId: string | null | undefined,
  options: { internalClub?: boolean } = {}
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const homeOrg = jugador.organizador_id?.trim() || null;
  const grantees = jugador.multiclubGranteePuntos ?? [];
  const clubLocalPts = rankingPuntosInternoClubDisplay(jugador);
  const totalRiviera = rankingPuntosGlobalDisplay(jugador);

  if (
    viewOrg &&
    isNativeMulticlubHomeRankingDisplay(jugador, viewOrg) &&
    grantees.length > 0
  ) {
    const homePts = jugador.stats?.puntos_totales ?? 0;
    const lines: JugadorPuntosBreakdownLine[] = [];

    for (const grantee of grantees) {
      if (grantee.puntosTotales <= 0) continue;
      lines.push({
        key: grantee.organizadorId,
        clubLabel: getOrganizerDisplayNameSync(grantee.organizadorId),
        puntos: grantee.puntosTotales,
        role: "other",
      });
    }

    if (homeOrg && homePts > 0) {
      lines.push({
        key: homeOrg,
        clubLabel: getOrganizerDisplayNameSync(homeOrg),
        puntos: homePts,
        role: "home",
      });
    }

    lines.push({
      key: "total",
      clubLabel: "Total Riviera",
      puntos: nativeMulticlubCareerPuntosTotal(jugador),
      role: "total",
    });

    return lines;
  }

  if (hasDualRankingConcedido(jugador)) {
    const origenId = resolveOrigenConcedidoOrganizadorId(jugador);
    const origenPts = rankingPuntosOrigenConcedido(jugador);
    const lines: JugadorPuntosBreakdownLine[] = [];

    if (origenId && origenPts > 0) {
      lines.push({
        key: origenId,
        clubLabel: getOrganizerDisplayNameSync(origenId),
        puntos: origenPts,
        role: viewOrg && origenId === viewOrg ? "home" : "other",
      });
    }

    const clubLabel = getOrganizerDisplayNameSync(
      viewOrg ?? jugador.organizador_id
    );
    if (clubLocalPts > 0 || (viewOrg && origenId !== viewOrg)) {
      lines.push({
        key: viewOrg ?? homeOrg ?? "club",
        clubLabel,
        puntos: clubLocalPts,
        role: "home",
      });
    }

    if (lines.length > 1 || totalRiviera > clubLocalPts) {
      lines.push({
        key: "total",
        clubLabel: "Total Riviera",
        puntos: totalRiviera,
        role: "total",
      });
    }

    return lines.length > 1 ? lines : [];
  }

  if (
    options.internalClub &&
    jugador.officialPuntosGlobal != null &&
    jugador.officialPuntosGlobal > clubLocalPts
  ) {
    const lines: JugadorPuntosBreakdownLine[] = [];

    if (viewOrg && clubLocalPts > 0) {
      lines.push({
        key: viewOrg,
        clubLabel: getOrganizerDisplayNameSync(viewOrg),
        puntos: clubLocalPts,
        role: "home",
      });
    }

    lines.push({
      key: "total",
      clubLabel: "Total Riviera",
      puntos: jugador.officialPuntosGlobal,
      role: "total",
    });

    return lines;
  }

  return [];
}
