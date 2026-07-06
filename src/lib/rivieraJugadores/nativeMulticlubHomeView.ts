import {
  enrichParticipacionesOrganizadorFromEvents,
  filterParticipacionesForOrganizador,
  groupPuntosByOtherOrganizadores,
  resolveParticipacionOrganizadorId,
  sumPuntosFromParticipaciones,
} from "./participacionesOrganizadorScope";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

/** Jugador nativo en su club origen con puntos en clubes cedidos (clones). */
export function isNativeMulticlubHomeRankingDisplay(
  jugador: RivieraJugadorWithStats,
  clubOrganizadorId: string | null | undefined
): boolean {
  const org = clubOrganizadorId?.trim();
  if (!org || jugador.concedidoPorAdmin) return false;
  if (jugador.organizador_id?.trim() !== org) return false;
  return (jugador.multiclubGranteePuntos?.length ?? 0) > 0;
}

export function nativeMulticlubCareerPuntosTotal(
  jugador: RivieraJugadorWithStats
): number {
  const home = jugador.stats?.puntos_totales ?? 0;
  const grantees = (jugador.multiclubGranteePuntos ?? []).reduce(
    (sum, g) => sum + g.puntosTotales,
    0
  );
  return home + grantees;
}

/** Líneas por club externo desde participaciones del perfil origen (sin clones). */
export function buildMulticlubGranteePuntosFromParticipaciones(
  sourceJugadorId: string,
  rows: JugadorParticipacion[],
  homeOrganizadorId: string
): Array<{
  organizadorId: string;
  localJugadorId: string;
  puntosTotales: number;
}> {
  return groupPuntosByOtherOrganizadores(rows, homeOrganizadorId)
    .filter((entry) => entry.puntosTotales > 0)
    .map((entry) => ({
      organizadorId: entry.organizadorId,
      localJugadorId: sourceJugadorId,
      puntosTotales: entry.puntosTotales,
    }));
}

/**
 * En club origen: puntos locales + líneas por otros clubes.
 * Solo cuenta participaciones en el perfil origen con metadata/evento de otro club.
 */
export async function enrichNativeMulticlubHomeClubView(
  viewingOrganizadorId: string,
  jugador: RivieraJugadorWithStats,
  options: {
    fetchParticipaciones: (
      jugadorId: string,
      limit: number
    ) => Promise<JugadorParticipacion[]>;
    participacionesLimit?: number;
  }
): Promise<RivieraJugadorWithStats> {
  const viewOrg = viewingOrganizadorId.trim();
  const homeOrg = jugador.organizador_id?.trim();
  if (!viewOrg || !homeOrg || homeOrg !== viewOrg || jugador.concedidoPorAdmin) {
    return jugador;
  }

  const limit = options.participacionesLimit ?? 100;
  const sourceRows = await enrichParticipacionesOrganizadorFromEvents(
    await options.fetchParticipaciones(jugador.id, limit)
  );

  const multiclubGranteePuntos = buildMulticlubGranteePuntosFromParticipaciones(
    jugador.id,
    sourceRows,
    homeOrg
  );

  if (multiclubGranteePuntos.length === 0) return jugador;

  const careerTotal = nativeMulticlubCareerPuntosTotal({
    ...jugador,
    multiclubGranteePuntos,
  });

  return {
    ...jugador,
    multiclubGranteePuntos,
    officialPuntosGlobal: careerTotal,
  };
}

export function filterHomeClubHistorial(
  rows: JugadorParticipacion[],
  homeOrganizadorId: string
): JugadorParticipacion[] {
  return filterParticipacionesForOrganizador(rows, homeOrganizadorId, {
    jugadorHomeOrganizadorId: homeOrganizadorId,
  });
}

export function filterOtherClubHistorial(
  rows: JugadorParticipacion[],
  homeOrganizadorId: string
): JugadorParticipacion[] {
  const home = homeOrganizadorId.trim();
  if (!home) return [];
  return rows.filter((row) => {
    const org = resolveParticipacionOrganizadorId(row, home)?.trim();
    return Boolean(org && org !== home);
  });
}

export function homeClubPuntosFromHistorial(
  rows: JugadorParticipacion[],
  homeOrganizadorId: string
): number {
  return sumPuntosFromParticipaciones(filterHomeClubHistorial(rows, homeOrganizadorId));
}
