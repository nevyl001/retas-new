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

/** Etiqueta del club anfitrión en esta vista de ranking (no genérico "Local"). */
function homeClubLabelForRankingView(
  viewingOrganizadorId: string | null | undefined,
  jugador: RivieraJugadorWithStats
): string {
  const viewOrg = viewingOrganizadorId?.trim();
  if (viewOrg) return getOrganizerDisplayNameSync(viewOrg);

  const homeOrg = jugador.organizador_id?.trim();
  if (homeOrg) return getOrganizerDisplayNameSync(homeOrg);

  return getOrganizerDisplayNameSync(null);
}

export function simpleJugadorPuntosDisplay(
  jugador: RivieraJugadorWithStats,
  hasOrgContext = false
): number {
  return hasOrgContext
    ? rankingPuntosInternoClubDisplay(jugador)
    : rankingPuntosGlobalDisplay(jugador);
}

/**
 * Líneas compactas: otros clubes → club de esta vista → Total.
 * Vacío = un solo número en UI.
 */
export function buildJugadorPuntosBreakdown(
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId: string | null | undefined,
  options: { hasOrgContext?: boolean } = {}
): JugadorPuntosBreakdownLine[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  const hasOrgContext = options.hasOrgContext ?? Boolean(viewOrg);
  const homeOrg = jugador.organizador_id?.trim() || null;
  const grantees = jugador.multiclubGranteePuntos ?? [];
  const clubLocalPts = rankingPuntosInternoClubDisplay(jugador);
  const totalRiviera = rankingPuntosGlobalDisplay(jugador);
  const homeClubLabel = homeClubLabelForRankingView(viewOrg, jugador);

  if (
    hasOrgContext &&
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

    if (homePts > 0) {
      lines.push({
        key: viewOrg,
        clubLabel: homeClubLabel,
        puntos: homePts,
        role: "home",
      });
    }

    lines.push({
      key: "total",
      clubLabel: "Total",
      puntos: nativeMulticlubCareerPuntosTotal(jugador),
      role: "total",
    });

    return lines;
  }

  if (hasDualRankingConcedido(jugador) && hasOrgContext) {
    const origenId = resolveOrigenConcedidoOrganizadorId(jugador);
    const origenPts = rankingPuntosOrigenConcedido(jugador);
    const lines: JugadorPuntosBreakdownLine[] = [];

    if (origenId && origenPts > 0 && origenId !== viewOrg) {
      lines.push({
        key: origenId,
        clubLabel: getOrganizerDisplayNameSync(origenId),
        puntos: origenPts,
        role: "other",
      });
    }

    if (clubLocalPts > 0 || viewOrg) {
      lines.push({
        key: viewOrg ?? homeOrg ?? "local",
        clubLabel: homeClubLabel,
        puntos: clubLocalPts,
        role: "home",
      });
    }

    if (lines.length > 0) {
      lines.push({
        key: "total",
        clubLabel: "Total",
        puntos: totalRiviera,
        role: "total",
      });
    }

    return lines.length > 1 ? lines : [];
  }

  if (
    hasOrgContext &&
    jugador.officialPuntosGlobal != null &&
    jugador.officialPuntosGlobal !== clubLocalPts
  ) {
    const lines: JugadorPuntosBreakdownLine[] = [];

    if (clubLocalPts > 0) {
      lines.push({
        key: viewOrg ?? homeOrg ?? "local",
        clubLabel: homeClubLabel,
        puntos: clubLocalPts,
        role: "home",
      });
    }

    lines.push({
      key: "total",
      clubLabel: "Total",
      puntos: jugador.officialPuntosGlobal,
      role: "total",
    });

    return lines;
  }

  if (hasOrgContext && clubLocalPts > 0 && totalRiviera > clubLocalPts) {
    return [
      { key: viewOrg ?? homeOrg ?? "local", clubLabel: homeClubLabel, puntos: clubLocalPts, role: "home" },
      { key: "total", clubLabel: "Total", puntos: totalRiviera, role: "total" },
    ];
  }

  return [];
}
