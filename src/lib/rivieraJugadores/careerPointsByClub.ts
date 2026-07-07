import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import { supabasePublicRead } from "../supabaseClient";
import { dedupeParticipacionesById } from "./grantedPlayerUnifiedView";
import {
  enrichParticipacionesOrganizadorFromEvents,
  resolveParticipacionOrganizadorId,
} from "./participacionesOrganizadorScope";
import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import {
  logRankingPointsAudit,
  snapshotFromCareer,
} from "./rankingPointsAudit";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

export type CareerClubPoints = {
  organizadorId: string;
  puntos: number;
};

export type CareerPointsByClubResult = {
  byClub: CareerClubPoints[];
  total: number;
  puntosByOrg: Map<string, number>;
};

export type GetCareerPointsByClubParams = {
  rivieraId?: string | null;
  linkedJugadorIds: string[];
  participaciones?: JugadorParticipacion[];
  viewingOrganizadorId?: string | null;
  includeViewingOrgWithZero?: boolean;
};

/** Mapa jugador_id → club dueño del perfil (para resolver org cuando falta metadata). */
export async function buildJugadorHomeOrgMap(
  jugadorIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(jugadorIds.map((id) => id.trim()).filter(Boolean))
  );
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await supabasePublicRead
    .from("riviera_jugadores")
    .select("id, organizador_id")
    .in("id", ids);

  if (error) {
    console.warn("[riviera-jugadores] buildJugadorHomeOrgMap:", error);
    return map;
  }

  for (const row of data ?? []) {
    const id = String((row as { id?: string }).id ?? "").trim();
    const org = String((row as { organizador_id?: string }).organizador_id ?? "").trim();
    if (id && org) map.set(id, org);
  }

  return map;
}

export async function buildJugadorHomeOrgMapFromParticipaciones(
  participaciones: JugadorParticipacion[],
  seedJugadorIds: string[] = []
): Promise<Map<string, string>> {
  const ids = new Set<string>(
    seedJugadorIds.map((id) => id.trim()).filter(Boolean)
  );
  for (const row of participaciones) {
    const id = row.jugador_id?.trim();
    if (id) ids.add(id);
  }
  return buildJugadorHomeOrgMap(Array.from(ids));
}

/**
 * Agrupa puntos de carrera por club desde historial global (fuente de verdad).
 * No depende del club de la vista ni del home org del perfil cargado.
 */
export function computeCareerPointsByClubFromParticipaciones(
  participaciones: JugadorParticipacion[],
  options?: {
    jugadorHomeOrgById?: Map<string, string>;
    viewingOrganizadorId?: string | null;
    includeViewingOrgWithZero?: boolean;
  }
): CareerPointsByClubResult {
  const byOrg = new Map<string, number>();

  for (const row of participaciones) {
    const jugadorId = row.jugador_id?.trim() ?? "";
    const homeOrg = jugadorId
      ? options?.jugadorHomeOrgById?.get(jugadorId)
      : undefined;
    const org = resolveParticipacionOrganizadorId(row, homeOrg)?.trim();
    if (!org) continue;
    byOrg.set(org, (byOrg.get(org) ?? 0) + (row.puntos_obtenidos ?? 0));
  }

  const viewOrg = options?.viewingOrganizadorId?.trim();
  if (viewOrg && options?.includeViewingOrgWithZero && !byOrg.has(viewOrg)) {
    byOrg.set(viewOrg, 0);
  }

  const byClub = Array.from(byOrg.entries()).map(([organizadorId, puntos]) => ({
    organizadorId,
    puntos,
  }));

  const total = byClub.reduce((sum, entry) => sum + entry.puntos, 0);

  return { byClub, total, puntosByOrg: byOrg };
}

export function sortCareerClubsForDisplay(
  byClub: CareerClubPoints[],
  viewingOrganizadorId: string | null | undefined
): CareerClubPoints[] {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  return [...byClub].sort((a, b) => {
    if (viewOrg) {
      if (a.organizadorId === viewOrg && b.organizadorId !== viewOrg) return -1;
      if (b.organizadorId === viewOrg && a.organizadorId !== viewOrg) return 1;
    }
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    return getOrganizerDisplayNameSync(a.organizadorId).localeCompare(
      getOrganizerDisplayNameSync(b.organizadorId),
      "es"
    );
  });
}

export function shouldShowCareerPointsBreakdown(
  career: CareerPointsByClubResult,
  viewingOrganizadorId?: string | null,
  options?: { localPuntos?: number }
): boolean {
  const withPoints = career.byClub.filter((entry) => entry.puntos > 0);
  if (withPoints.length >= 2) return true;

  const viewOrg = viewingOrganizadorId?.trim();
  const displayClubCount =
    career.byClub.length +
    (viewOrg && !career.byClub.some((entry) => entry.organizadorId === viewOrg) ? 1 : 0);
  if (displayClubCount > 1) return true;

  if (options?.localPuntos != null && career.total !== options.localPuntos) {
    return true;
  }

  if (!viewOrg) return withPoints.length >= 2;

  const viewingEntry = career.byClub.find((entry) => entry.organizadorId === viewOrg);
  const otherWithPoints = withPoints.filter((entry) => entry.organizadorId !== viewOrg);
  return Boolean(viewingEntry && viewingEntry.puntos === 0 && otherWithPoints.length > 0);
}

/**
 * Carrera global por Riviera ID: suma puntos en todos los clubes enlazados.
 */
export async function getCareerPointsByClub(
  params: GetCareerPointsByClubParams
): Promise<CareerPointsByClubResult> {
  const linkedIds = Array.from(
    new Set(params.linkedJugadorIds.map((id) => id.trim()).filter(Boolean))
  );

  let rows = params.participaciones;
  if (!rows) {
    const lists = await Promise.all(
      linkedIds.map((id) => listCareerParticipacionesPublic(id, 500))
    );
    rows = dedupeParticipacionesById(
      lists.flatMap((list) => list ?? [])
    );
  }

  const enriched = await enrichParticipacionesOrganizadorFromEvents(rows);
  const homeMap = await buildJugadorHomeOrgMapFromParticipaciones(
    enriched,
    linkedIds
  );

  return computeCareerPointsByClubFromParticipaciones(enriched, {
    jugadorHomeOrgById: homeMap,
    viewingOrganizadorId: params.viewingOrganizadorId,
    includeViewingOrgWithZero: params.includeViewingOrgWithZero,
  });
}

function careerFieldsFromResult(
  jugador: RivieraJugadorWithStats,
  career: CareerPointsByClubResult,
  homeOrg: string
): Pick<
  RivieraJugadorWithStats,
  "careerPuntosByClub" | "careerPuntosTotal" | "multiclubGranteePuntos" | "officialPuntosGlobal"
> {
  const multiclubGranteePuntos = career.byClub
    .filter((entry) => entry.organizadorId !== homeOrg && entry.puntos > 0)
    .map((entry) => ({
      organizadorId: entry.organizadorId,
      localJugadorId: jugador.id,
      puntosTotales: entry.puntos,
    }));

  return {
    careerPuntosByClub: career.byClub,
    careerPuntosTotal: career.total,
    multiclubGranteePuntos:
      multiclubGranteePuntos.length > 0 ? multiclubGranteePuntos : undefined,
    officialPuntosGlobal: career.total,
  };
}

export async function attachCareerPuntosToJugador(
  jugador: RivieraJugadorWithStats,
  options?: {
    participaciones?: JugadorParticipacion[];
    linkedJugadorIds?: string[];
    viewingOrganizadorId?: string | null;
    includeViewingOrgWithZero?: boolean;
  }
): Promise<RivieraJugadorWithStats> {
  const linkedIds = Array.from(
    new Set(
      [
        jugador.id,
        jugador.grantedAccess?.sourceJugadorId,
        ...(options?.linkedJugadorIds ?? []),
      ]
        .map((id) => id?.trim())
        .filter(Boolean) as string[]
    )
  );

  let rows = options?.participaciones;
  if (!rows) {
    const lists = await Promise.all(
      linkedIds.map((id) => listCareerParticipacionesPublic(id, 500))
    );
    // GUARD: dedupe obligatorio — nunca sumar participaciones duplicadas por N×RPC.
    const merged = dedupeParticipacionesById(
      lists.flatMap((list) => list ?? [])
    );
    if (merged.length === 0) return jugador;
    rows = merged;
  }

  const enriched = await enrichParticipacionesOrganizadorFromEvents(rows);
  const homeMap = await buildJugadorHomeOrgMapFromParticipaciones(
    enriched,
    linkedIds
  );
  const career = computeCareerPointsByClubFromParticipaciones(enriched, {
    jugadorHomeOrgById: homeMap,
    viewingOrganizadorId: options?.viewingOrganizadorId,
    includeViewingOrgWithZero: options?.includeViewingOrgWithZero,
  });

  if (career.byClub.length === 0 && career.total === 0) return jugador;

  const homeOrg = jugador.organizador_id?.trim() ?? "";

  const enrichedJugador = {
    ...jugador,
    ...careerFieldsFromResult(jugador, career, homeOrg),
  };
  logRankingPointsAudit(
    "careerPointsByClub.attachCareerPuntosToJugador",
    enrichedJugador,
    snapshotFromCareer(career, options?.viewingOrganizadorId),
    { linkedIds, participacionCount: rows.length }
  );
  return enrichedJugador;
}

export { careerFieldsFromResult };

/** Puntos acumulados en un club (desde carrera enriquecida; no usa club origen del jugador). */
export function getPlayerPointsByOrganizer(
  career: CareerPointsByClubResult,
  organizadorId: string | null | undefined
): number {
  const org = organizadorId?.trim();
  if (!org) return 0;
  return career.puntosByOrg.get(org) ?? 0;
}

/** Total global de puntos de carrera (suma de todos los clubes). */
export function getPlayerGlobalPoints(career: CareerPointsByClubResult): number {
  return career.total;
}
