import { supabasePublicRead } from "../supabaseClient";
import { attachCareerPuntosToJugador } from "./careerPointsByClub";
import {
  getOrLoadCareerIdentityBundle,
  type CareerIdentityBundle,
} from "./careerIdentityCache";
import {
  buildGrantsContextForRoster,
  type FindGrantedAccessMetaOptions,
} from "./organizerPlayerAccess";
import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import {
  linkedProfilesFromIdentityRows,
  listParticipacionesForJugadorIds,
  type PublicIdentityRpcRow,
} from "./publicCareerLinkage";
import {
  resolvePlayerCareer,
  resolvePlayerIdentity,
  type ResolvedPlayerIdentity,
} from "./playerIdentityService";
import { resolvePlayerPointsBreakdown } from "./playerPointsBreakdown";
import { logRankingPointsAudit, snapshotFromBreakdown } from "./rankingPointsAudit";
import type { RivieraJugadorWithStats } from "./types";

type RosterBatchEntry = {
  bundle: CareerIdentityBundle;
  officialPuntosGlobal: number | null;
};

type IdentityBatchRow = PublicIdentityRpcRow & { anchor_jugador_id: string };

function isMissingRosterBatchRpcError(
  error: { code?: string; message?: string; status?: number } | null
): boolean {
  if (!error) return false;
  return error.status === 404 || error.code === "42883" || error.code === "PGRST202";
}

/**
 * Precarga identidad + carrera + puntos ROMC para TODO un roster de una sola
 * vez (2 RPCs batch), en vez de que cada jugador del roster los vuelva a
 * pedir por separado (incidente de rendimiento 2026-08-05, fuentes 3-4 del
 * N+1: resolve_public_player_identity y riviera_official_display_puntos_for_jugador
 * corrían una vez POR JUGADOR vía resolvePlayerIdentity/attachCareerPuntosToJugador).
 * Requiere las RPCs de supabase/migrations/0018_roster_identity_career_puntos_batch.sql.
 *
 * No hay una tercera RPC para historial: resolve_public_player_identity_batch
 * ya devuelve, por anchor, el mismo conjunto de linked_jugador_id que
 * get_public_career_jugador_ids -- el historial se arma con UNA sola llamada
 * a listParticipacionesForJugadorIds (ya batch, ver publicCareerLinkage.ts)
 * sobre la unión de esos ids de TODO el roster, igual que hace
 * riviera_list_career_participaciones_public para un solo jugador (verificado
 * contra el cuerpo real desplegado en producción, no contra una copia
 * versionada desactualizada -- ver comentario en la migración 0018).
 *
 * Si las RPCs batch no están desplegadas todavía (o fallan), devuelve un mapa
 * vacío: cada jugador cae automáticamente al camino individual existente
 * (resolvePlayerIdentity/resolvePlayerCareer/attachCareerPuntosToJugador sin
 * cambios) -- nunca un dato incompleto o distinto al de hoy, solo se pierde
 * la optimización hasta que la migración esté aplicada.
 *
 * No es un caché: es un valor calculado una vez por carga y pasado por
 * parámetro, igual que buildGrantsContextForRoster.
 */
async function resolveRosterCareerIdentityBatch(
  organizadorId: string,
  jugadores: RivieraJugadorWithStats[]
): Promise<Map<string, RosterBatchEntry>> {
  const result = new Map<string, RosterBatchEntry>();
  const ids = Array.from(new Set(jugadores.map((j) => j.id.trim()).filter(Boolean)));
  if (ids.length === 0) return result;

  const [identityRes, puntosRes] = await Promise.all([
    supabasePublicRead.rpc("resolve_public_player_identity_batch", {
      p_jugador_ids: ids,
    }),
    supabasePublicRead.rpc("riviera_official_display_puntos_for_jugador_batch", {
      p_riviera_jugador_ids: ids,
    }),
  ]);

  if (identityRes.error) {
    if (!isMissingRosterBatchRpcError(identityRes.error)) {
      console.warn(
        "[organizerScopedStats] resolveRosterCareerIdentityBatch falló; roster cae al camino individual:",
        identityRes.error
      );
    }
    return result;
  }

  const identityRows = (identityRes.data ?? []) as IdentityBatchRow[];
  const puntosRows = puntosRes.error
    ? []
    : ((puntosRes.data ?? []) as Array<{ jugador_id: string; puntos: number }>);

  const identityByAnchor = new Map<string, IdentityBatchRow[]>();
  for (const row of identityRows) {
    const anchor = row.anchor_jugador_id;
    if (!anchor) continue;
    const list = identityByAnchor.get(anchor) ?? [];
    list.push(row);
    identityByAnchor.set(anchor, list);
  }

  const puntosByJugadorId = new Map(puntosRows.map((r) => [r.jugador_id, r.puntos]));

  const linkageByAnchor = new Map<
    string,
    ReturnType<typeof linkedProfilesFromIdentityRows>
  >();
  const allLinkedIds = new Set<string>();
  for (const jugador of jugadores) {
    const rows = identityByAnchor.get(jugador.id);
    if (!rows || rows.length === 0) continue;
    const linkage = linkedProfilesFromIdentityRows(rows, jugador.id);
    linkageByAnchor.set(jugador.id, linkage);
    for (const id of linkage.linkedJugadorIds) allLinkedIds.add(id);
  }

  if (linkageByAnchor.size === 0) return result;

  const byIdsRows = allLinkedIds.size
    ? await listParticipacionesForJugadorIds(Array.from(allLinkedIds), 500)
    : [];

  for (const jugador of jugadores) {
    const linkage = linkageByAnchor.get(jugador.id);
    if (!linkage) continue;

    const linkedSet = new Set(linkage.linkedJugadorIds);
    const rowsForPlayer = (byIdsRows ?? []).filter((p) => linkedSet.has(p.jugador_id));
    const participaciones = await enrichParticipacionesOrganizadorFromEvents(rowsForPlayer);

    const identity: ResolvedPlayerIdentity = {
      input: { kind: "jugadorId", jugadorId: jugador.id },
      anchorJugadorId: jugador.id,
      canonicalJugadorId: linkage.canonicalJugadorId,
      rivieraId: linkage.rivieraId,
      officialPlayerKey: linkage.officialPlayerKey,
      linkedJugadorIds: linkage.linkedJugadorIds,
      linkedProfiles: linkage.linkedProfiles,
      homeOrganizadorId: linkage.homeOrganizadorId,
      // El roster ya trae la fila propia del jugador en este organizador,
      // pero con un shape MÁS ANGOSTO que el de riviera_jugador_interno_por_id
      // (riviera_ranking_interno_por_organizador no devuelve email/telefono/
      // whatsapp/nivel/mano_dominante/derrotas/empates/racha_actual/etc. --
      // verificado contra el cuerpo real de ambas RPCs en producción). Es
      // seguro usarla acá SOLO porque ningún consumidor de este identity
      // (enrichJugadorOrganizerScopedStats más abajo) lee displayJugador
      // directamente -- usa `jugador` (el original) para el resultado final
      // y solo identity.linkedJugadorIds para el cálculo de carrera. Si algún
      // día algo empieza a leer identity.displayJugador para mostrar campos
      // fuera de nombre/categoria/rating/puntos, dejaría de ser seguro.
      displayJugador: jugador,
      resolutionSource: "viewing_org_internal",
      viewingOrganizadorId: organizadorId,
    };

    result.set(jugador.id, {
      bundle: { identity, participaciones },
      officialPuntosGlobal: puntosByJugadorId.get(jugador.id) ?? null,
    });
  }

  return result;
}

/**
 * Enriquece filas del ranking con carrera global por club (todos los perfiles).
 * Usa el mismo motor de identidad que la ficha pública — nunca stats locales parciales.
 */
export async function enrichJugadoresOrganizerScopedStats(
  organizadorId: string,
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  const org = organizadorId.trim();
  if (!org || jugadores.length === 0) return jugadores;

  // La resolución de identidad de CADA jugador del roster vuelve a probar
  // (entre otros) getRivieraJugadorInternalClubById(jugadorId, org), que
  // internamente resuelve grants de ESTE MISMO org -- se pedían una vez por
  // jugador (segunda fuente del N+1 del incidente 2026-08-05, la primera ya
  // se había cerrado en concedidoClubView.ts). Se precarga una sola vez para
  // todo el roster y se reutiliza en cada resolución -- mismo resultado,
  // mismo predicado, solo pedido 1 vez en vez de N.
  const grantsContext = await buildGrantsContextForRoster(
    org,
    jugadores.map((j) => j.id)
  );

  const rosterBatch = await resolveRosterCareerIdentityBatch(org, jugadores);

  return Promise.all(
    jugadores.map(async (j) =>
      enrichJugadorOrganizerScopedStats(org, j, grantsContext, rosterBatch.get(j.id))
    )
  );
}

/**
 * Resuelve identity + carrera global, cacheado por (organizadorId, jugadorId)
 * vía careerIdentityCache. Todo lo posterior (attachCareerPuntosToJugador,
 * resolvePlayerPointsBreakdown) sigue ejecutándose siempre, sin caché — solo
 * se evita repetir la cadena de RPC/queries de identidad+carrera.
 */
async function resolveCareerIdentityBundleCached(
  organizadorId: string,
  jugadorId: string,
  grantsContext?: FindGrantedAccessMetaOptions,
  knownRow?: RivieraJugadorWithStats,
  precomputedBundle?: CareerIdentityBundle
): Promise<CareerIdentityBundle | null> {
  return getOrLoadCareerIdentityBundle(organizadorId, jugadorId, async () => {
    if (precomputedBundle) return precomputedBundle;

    const identity = await resolvePlayerIdentity(
      { kind: "jugadorId", jugadorId },
      organizadorId,
      grantsContext,
      knownRow
    );
    if (!identity) return null;
    const careerBundle = await resolvePlayerCareer(identity, 500);
    return { identity, participaciones: careerBundle.participaciones };
  });
}

async function enrichJugadorOrganizerScopedStats(
  organizadorId: string,
  jugador: RivieraJugadorWithStats,
  grantsContext?: FindGrantedAccessMetaOptions,
  rosterBatchEntry?: RosterBatchEntry
): Promise<RivieraJugadorWithStats> {
  const cached = await resolveCareerIdentityBundleCached(
    organizadorId,
    jugador.id,
    grantsContext,
    jugador,
    rosterBatchEntry?.bundle
  );

  if (cached) {
    const { identity, participaciones: historialGlobal } = cached;

    const careerJugador = await attachCareerPuntosToJugador(jugador, {
      linkedJugadorIds: identity.linkedJugadorIds,
      participaciones: historialGlobal,
      viewingOrganizadorId: organizadorId,
      includeViewingOrgWithZero: true,
      preloadedOfficialGlobalPuntos: rosterBatchEntry?.officialPuntosGlobal,
    });

    const pointsBreakdown = await resolvePlayerPointsBreakdown({
      jugador: careerJugador,
      identity,
      currentOrganizadorId: organizadorId,
      participaciones: historialGlobal,
    });

    logRankingPointsAudit(
      "organizerScopedStats.enrichJugadoresOrganizerScopedStats",
      careerJugador,
      snapshotFromBreakdown(pointsBreakdown, organizadorId),
      { viewingOrganizadorId: organizadorId, source: "identity_motor" }
    );

    return {
      ...careerJugador,
      pointsBreakdown,
    };
  }

  const enriched = await attachCareerPuntosToJugador(jugador, {
    viewingOrganizadorId: organizadorId,
    includeViewingOrgWithZero: true,
  });

  const pointsBreakdown = await resolvePlayerPointsBreakdown({
    jugador: enriched,
    currentOrganizadorId: organizadorId,
  });

  logRankingPointsAudit(
    "organizerScopedStats.enrichJugadoresOrganizerScopedStats",
    enriched,
    snapshotFromBreakdown(pointsBreakdown, organizadorId),
    { viewingOrganizadorId: organizadorId, source: "legacy_anchor" }
  );

  return {
    ...enriched,
    pointsBreakdown,
  };
}
