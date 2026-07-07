/**
 * Motor único de identidad del jugador (Riviera ID / carrera global).
 *
 * GUARD: El jugador no pertenece al club. Tiene carrera global por Riviera ID.
 * GUARD: Ningún UUID local debe bloquearse solo porque no pertenece al org de la URL.
 * GUARD: Historial y puntos globales vienen de carrera deduplicada, no de org-first.
 */
import {
  attachCareerPuntosToJugador,
  buildJugadorHomeOrgMapFromParticipaciones,
  computeCareerPointsByClubFromParticipaciones,
  type CareerPointsByClubResult,
} from "./careerPointsByClub";
import { resolvePlayerPointsBreakdown } from "./playerPointsBreakdown";
import { mergeCareerParticipacionesForIdentity } from "./careerParticipacionesMerge";
import { enrichJugadorConcedidoClubView } from "./concedidoClubView";
import {
  dedupeParticipacionesById,
  loadUnifiedRatingViewForJugador,
} from "./grantedPlayerUnifiedView";
import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import { discoverCareerLinkedProfiles } from "./careerLinkedProfileDiscovery";
import {
  fetchPublicCareerJugadorIds,
} from "./publicCareerLinkage";
import { mergeJugadorStatsPuntosTotales } from "./rankingPosition";
import type { RatingRpcFallbackOptions } from "./ratingRpcErrors";
import {
  getRivieraJugadorBySlug,
  getRivieraJugadorInternalClubById,
  getRivieraJugadorPublicById,
  getRivieraJugadorPublicBySlug,
  obtenerHistorialRatingPublic,
  resolveRankingPosicionForPublicFicha,
} from "./rivieraJugadoresService";
import { fetchRivieraIdMapForJugadorIds, isValidRivieraId } from "./rivieraIdDisplay";
import { supabasePublicRead } from "../supabaseClient";
import type {
  JugadorParticipacion,
  JugadorStats,
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "./types";

export type PlayerIdentityInput =
  | { kind: "jugadorId"; jugadorId: string }
  | { kind: "slug"; slug: string }
  | { kind: "rivieraId"; rivieraId: string };

export type PlayerIdentityResolutionSource =
  | "identity_rpc"
  | "career_rpc"
  | "sibling_discovery"
  | "viewing_org_internal"
  | "home_org_internal"
  | "grant_clone"
  | "public_by_id"
  | "public_by_slug"
  | "canonical_public";

export type ResolvedPlayerIdentity = {
  input: PlayerIdentityInput;
  anchorJugadorId: string;
  canonicalJugadorId: string;
  rivieraId: string | null;
  officialPlayerKey: string | null;
  linkedJugadorIds: string[];
  linkedProfiles: Array<{ jugadorId: string; organizadorId: string }>;
  homeOrganizadorId: string | null;
  displayJugador: RivieraJugadorWithStats;
  resolutionSource: PlayerIdentityResolutionSource;
  viewingOrganizadorId: string | null;
};

export type PlayerCareerBundle = {
  participaciones: JugadorParticipacion[];
  duplicateCount: number;
  source: "career_rpc" | "merged_linked";
};

export type PublicPlayerProfileData = {
  jugador: RivieraJugadorWithStats;
  identity: ResolvedPlayerIdentity;
  viewingOrgId: string | null;
  hasOrgContext: boolean;
  localRankingPos: number | null;
  historialGlobal: JugadorParticipacion[];
  historialMain: JugadorParticipacion[];
  historialOtrosClubes: JugadorParticipacion[];
  historialRating: RatingHistorialEntry[];
  career: CareerPointsByClubResult;
  debug?: PlayerIdentityDebugSnapshot;
};

export type PlayerIdentityDebugSnapshot = {
  identity: ResolvedPlayerIdentity;
  careerRowCount: number;
  careerDuplicateCount: number;
  pointsByClub: CareerPointsByClubResult["byClub"];
  careerTotal: number;
  historialLength: number;
  ratingMovementsLength: number;
  resolutionSource: string;
};

export type GetPublicPlayerProfileInput = {
  playerId?: string;
  slug?: string;
  rivieraId?: string;
  viewingOrgId: string | null;
  ratingRpc?: RatingRpcFallbackOptions;
  historialLimit?: number;
  includeDebug?: boolean;
};

export type GetAdminPlayerProfileInput = {
  organizadorId: string;
  slug: string;
  /** Perfil local del club (evita doble fetch si ya se resolvió). */
  localJugador?: RivieraJugadorWithStats;
  historialLimit?: number;
  ratingRpc?: RatingRpcFallbackOptions;
};

export type AdminPlayerProfileData = PublicPlayerProfileData & {
  /** Perfil local del club activo — id usado para edición y permisos admin. */
  localJugador: RivieraJugadorWithStats;
};

type IdentityRpcRow = {
  anchor_jugador_id?: string;
  canonical_jugador_id?: string;
  riviera_id?: string | null;
  official_player_key?: string | null;
  home_organizador_id?: string | null;
  linked_jugador_id?: string;
  linked_organizador_id?: string | null;
};

function isMissingIdentityRpcError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("resolve_public_player_identity")
  );
}

async function fetchIdentityFromRpc(
  jugadorId?: string | null,
  rivieraId?: string | null
): Promise<IdentityRpcRow[] | null> {
  const params: Record<string, string | null> = {
    p_jugador_id: jugadorId?.trim() || null,
    p_riviera_id: rivieraId?.trim() || null,
  };
  if (!params.p_jugador_id && !params.p_riviera_id) return null;

  const { data, error } = await supabasePublicRead.rpc(
    "resolve_public_player_identity",
    params
  );
  if (error) {
    if (isMissingIdentityRpcError(error)) return null;
    console.warn("[player-identity] resolve_public_player_identity:", error);
    return null;
  }
  return (data ?? []) as IdentityRpcRow[];
}

async function resolveAnchorJugadorIdFromRivieraId(
  rivieraId: string
): Promise<string | null> {
  const rows = await fetchIdentityFromRpc(null, rivieraId);
  if (rows?.length) {
    const anchor = rows[0]?.anchor_jugador_id?.trim();
    if (anchor) return anchor;
  }

  const { data } = await supabasePublicRead
    .from("riviera_official_player_identity")
    .select("canonical_riviera_jugador_id")
    .eq("riviera_id", rivieraId.trim())
    .maybeSingle();

  const canonical = String(
    (data as { canonical_riviera_jugador_id?: string } | null)
      ?.canonical_riviera_jugador_id ?? ""
  ).trim();
  return canonical || null;
}

/** Única fuente de linked IDs — siempre carrera/identidad primero, nunca solo grant. */
export async function resolveLinkedJugadorIdsForIdentity(
  anchorJugadorId: string
): Promise<{
  linkedJugadorIds: string[];
  linkedProfiles: Array<{ jugadorId: string; organizadorId: string }>;
  rivieraId: string | null;
  officialPlayerKey: string | null;
  canonicalJugadorId: string;
  homeOrganizadorId: string | null;
  source: PlayerIdentityResolutionSource;
}> {
  const anchor = anchorJugadorId.trim();
  const ids = new Set<string>([anchor]);
  const profileMap = new Map<string, string>();
  let rivieraId: string | null = null;
  let officialPlayerKey: string | null = null;
  let canonicalJugadorId = anchor;
  let homeOrganizadorId: string | null = null;
  let source: PlayerIdentityResolutionSource = "career_rpc";

  const rpcRows = await fetchIdentityFromRpc(anchor, null);
  if (rpcRows && rpcRows.length > 0) {
    source = "identity_rpc";
    for (const row of rpcRows) {
      const linked = row.linked_jugador_id?.trim();
      const org = row.linked_organizador_id?.trim();
      if (linked) {
        ids.add(linked);
        if (org) profileMap.set(linked, org);
      }
      if (!rivieraId && row.riviera_id) rivieraId = String(row.riviera_id);
      if (!officialPlayerKey && row.official_player_key) {
        officialPlayerKey = String(row.official_player_key);
      }
      if (row.canonical_jugador_id) {
        canonicalJugadorId = String(row.canonical_jugador_id).trim();
      }
      if (!homeOrganizadorId && row.home_organizador_id) {
        homeOrganizadorId = String(row.home_organizador_id).trim();
      }
    }
  } else {
    source = "career_rpc";
    const careerIds = await fetchPublicCareerJugadorIds(anchor);
    if (careerIds) {
      for (const id of careerIds) ids.add(id);
    }

    const rivieraMap = await fetchRivieraIdMapForJugadorIds(
      [anchor, ...Array.from(ids)],
      { publicRanking: true }
    );
    rivieraId = rivieraMap.get(anchor) ?? rivieraMap.get(canonicalJugadorId) ?? null;
  }

  const discovered = await discoverCareerLinkedProfiles({
    anchorJugadorId: anchor,
    rivieraId,
    officialPlayerKey,
    seedJugadorIds: Array.from(ids),
  });
  for (const profile of discovered.linkedProfiles) {
    ids.add(profile.jugadorId);
    if (profile.organizadorId) profileMap.set(profile.jugadorId, profile.organizadorId);
  }
  if (discovered.linkedJugadorIds.length > ids.size) {
    source = source === "identity_rpc" ? "identity_rpc" : "sibling_discovery";
  }

  const linkedProfiles = Array.from(ids).map((jugadorId) => ({
    jugadorId,
    organizadorId: profileMap.get(jugadorId) ?? "",
  }));

  return {
    linkedJugadorIds: Array.from(ids),
    linkedProfiles,
    rivieraId,
    officialPlayerKey,
    canonicalJugadorId,
    homeOrganizadorId,
    source,
  };
}

function knownOrganizadorCandidatesFromEnv(): string[] {
  return [
    process.env.REACT_APP_RIVIERA_PUBLIC_ORGANIZADOR_ID,
    process.env.REACT_APP_HACK_PADEL_ORGANIZADOR_ID,
    process.env.REACT_APP_CLUB_TEST_ORGANIZADOR_ID,
  ]
    .map((id) => id?.trim())
    .filter(Boolean) as string[];
}

async function loadDisplayJugadorIdentityFirst(params: {
  anchorJugadorId: string;
  viewingOrganizadorId: string | null;
  linkedProfiles: Array<{ jugadorId: string; organizadorId: string }>;
  homeOrganizadorId: string | null;
  slug?: string;
}): Promise<{
  jugador: RivieraJugadorWithStats;
  source: PlayerIdentityResolutionSource;
} | null> {
  const {
    anchorJugadorId,
    viewingOrganizadorId,
    linkedProfiles,
    homeOrganizadorId,
    slug,
  } = params;
  const viewOrg = viewingOrganizadorId?.trim() || null;

  if (viewOrg) {
    const viewingInternal = await getRivieraJugadorInternalClubById(
      anchorJugadorId,
      viewOrg
    );
    if (viewingInternal) {
      return { jugador: viewingInternal, source: "viewing_org_internal" };
    }

    const siblingInView = linkedProfiles.find(
      (p) => p.organizadorId === viewOrg && p.jugadorId
    );
    if (siblingInView) {
      const row = await getRivieraJugadorInternalClubById(
        siblingInView.jugadorId,
        viewOrg
      );
      if (row) return { jugador: row, source: "sibling_discovery" };
    }
  }

  const homeOrg =
    homeOrganizadorId?.trim() ||
    linkedProfiles.find((p) => p.jugadorId === anchorJugadorId)?.organizadorId ||
    linkedProfiles.find((p) => p.organizadorId)?.organizadorId ||
    null;

  if (homeOrg) {
    const homeRow = await getRivieraJugadorInternalClubById(
      anchorJugadorId,
      homeOrg
    );
    if (homeRow) {
      return { jugador: homeRow, source: "home_org_internal" };
    }
  }

  for (const profile of linkedProfiles) {
    if (!profile.organizadorId) continue;
    const row = await getRivieraJugadorInternalClubById(
      profile.jugadorId,
      profile.organizadorId
    );
    if (row) {
      return { jugador: row, source: "home_org_internal" };
    }
  }

  const publicById = await getRivieraJugadorPublicById(anchorJugadorId);
  if (publicById) {
    return { jugador: publicById, source: "public_by_id" };
  }

  if (slug?.trim()) {
    const bySlug = await getRivieraJugadorPublicBySlug(
      slug.trim(),
      viewOrg ?? undefined
    );
    if (bySlug) {
      return { jugador: bySlug, source: "public_by_slug" };
    }
  }

  const probeOrgs = Array.from(
    new Set(
      [
        viewOrg,
        homeOrganizadorId,
        ...linkedProfiles.map((p) => p.organizadorId),
        ...knownOrganizadorCandidatesFromEnv(),
      ]
        .map((id) => id?.trim())
        .filter(Boolean) as string[]
    )
  );
  for (const org of probeOrgs) {
    const probed = await getRivieraJugadorInternalClubById(anchorJugadorId, org);
    if (probed) {
      return { jugador: probed, source: "home_org_internal" };
    }
  }

  return null;
}

/** Resuelve identidad global ANTES del contexto de club. */
export async function resolvePlayerIdentity(
  input: PlayerIdentityInput,
  viewingOrganizadorId?: string | null
): Promise<ResolvedPlayerIdentity | null> {
  const viewOrg = viewingOrganizadorId?.trim() || null;
  let anchorJugadorId: string | null = null;

  if (input.kind === "jugadorId") {
    anchorJugadorId = input.jugadorId.trim();
  } else if (input.kind === "rivieraId") {
    if (!isValidRivieraId(input.rivieraId)) return null;
    anchorJugadorId = await resolveAnchorJugadorIdFromRivieraId(input.rivieraId);
  } else if (input.kind === "slug") {
    const bySlug = await getRivieraJugadorPublicBySlug(
      input.slug.trim(),
      viewOrg ?? undefined
    );
    if (bySlug?.id) anchorJugadorId = bySlug.id.trim();
  }

  if (!anchorJugadorId) return null;

  const linkage = await resolveLinkedJugadorIdsForIdentity(anchorJugadorId);
  const slug = input.kind === "slug" ? input.slug : undefined;

  const display = await loadDisplayJugadorIdentityFirst({
    anchorJugadorId,
    viewingOrganizadorId: viewOrg,
    linkedProfiles: linkage.linkedProfiles,
    homeOrganizadorId: linkage.homeOrganizadorId,
    slug,
  });

  if (!display) return null;

  return {
    input,
    anchorJugadorId,
    canonicalJugadorId: linkage.canonicalJugadorId,
    rivieraId: linkage.rivieraId,
    officialPlayerKey: linkage.officialPlayerKey,
    linkedJugadorIds: linkage.linkedJugadorIds,
    linkedProfiles: linkage.linkedProfiles,
    homeOrganizadorId: linkage.homeOrganizadorId,
    displayJugador: display.jugador,
    resolutionSource: display.source,
    viewingOrganizadorId: viewOrg,
  };
}

/** Carrera global deduplicada — GUARD: siempre dedupe por participacion.id */
export async function resolvePlayerCareer(
  identity: ResolvedPlayerIdentity,
  limit = 500
): Promise<PlayerCareerBundle> {
  const participaciones = await mergeCareerParticipacionesForIdentity(
    identity,
    limit
  );
  const deduped = dedupeParticipacionesById(participaciones).slice(0, limit);

  return {
    participaciones: deduped,
    duplicateCount: participaciones.length - deduped.length,
    source: deduped.length > 0 ? "merged_linked" : "career_rpc",
  };
}

/** Puntos globales por club desde carrera deduplicada. */
export async function resolvePlayerPoints(
  identity: ResolvedPlayerIdentity,
  career?: PlayerCareerBundle
): Promise<CareerPointsByClubResult> {
  const bundle = career ?? (await resolvePlayerCareer(identity));
  const enriched = await enrichParticipacionesOrganizadorFromEvents(
    bundle.participaciones
  );
  const homeMap = await buildJugadorHomeOrgMapFromParticipaciones(
    enriched,
    identity.linkedJugadorIds
  );
  return computeCareerPointsByClubFromParticipaciones(enriched, {
    jugadorHomeOrgById: homeMap,
    viewingOrganizadorId: identity.viewingOrganizadorId,
    includeViewingOrgWithZero: Boolean(identity.viewingOrganizadorId),
  });
}

/** Historial global = carrera deduplicada (sin filtro por org). */
export async function resolvePlayerHistory(
  identity: ResolvedPlayerIdentity,
  limit = 100
): Promise<JugadorParticipacion[]> {
  const career = await resolvePlayerCareer(identity, limit);
  return career.participaciones.slice(0, limit);
}

/** Contexto local: concedido, ranking club. No altera carrera global. */
export async function resolvePlayerLocalContext(
  identity: ResolvedPlayerIdentity,
  jugador: RivieraJugadorWithStats,
  options?: { ratingRpc?: RatingRpcFallbackOptions }
): Promise<{
  jugador: RivieraJugadorWithStats;
  localRankingPos: number | null;
}> {
  const org = identity.viewingOrganizadorId;
  let enriched = jugador;

  if (org) {
    enriched = await enrichJugadorConcedidoClubView(org, enriched, {
      rpc: options?.ratingRpc,
    });
  }

  const localRankingPos = await resolveRankingPosicionForPublicFicha(enriched, {
    orgId: org,
    preferClubRanking: Boolean(org),
  });

  return { jugador: enriched, localRankingPos };
}

function emptyStats(jugadorId: string): JugadorStats {
  return {
    jugador_id: jugadorId,
    total_partidos: 0,
    victorias: 0,
    derrotas: 0,
    empates: 0,
    participaciones_solo: 0,
    pct_victorias: 0,
    total_retas: 0,
    total_torneos_express: 0,
    total_ligas: 0,
    total_americanos: 0,
    sets_favor_total: 0,
    sets_contra_total: 0,
    racha_actual: "",
    ultima_actividad: null,
    puntos_totales: 0,
    updated_at: new Date().toISOString(),
  };
}

/** Única entrada de ficha pública: identidad → carrera → puntos → contexto org. */
export async function getPublicPlayerProfileData(
  params: GetPublicPlayerProfileInput
): Promise<PublicPlayerProfileData | null> {
  const {
    playerId,
    slug,
    rivieraId,
    viewingOrgId,
    ratingRpc,
    historialLimit = 100,
    includeDebug = false,
  } = params;

  const org = viewingOrgId?.trim() || null;
  const hasOrgContext = Boolean(org);

  const input: PlayerIdentityInput = rivieraId?.trim()
    ? { kind: "rivieraId", rivieraId: rivieraId.trim() }
    : playerId?.trim()
    ? { kind: "jugadorId", jugadorId: playerId.trim() }
    : { kind: "slug", slug: slug?.trim() ?? "" };

  const identity = await resolvePlayerIdentity(input, org);
  if (!identity) return null;

  const careerBundle = await resolvePlayerCareer(identity, historialLimit);
  const historialGlobal = careerBundle.participaciones;
  const career = await resolvePlayerPoints(identity, careerBundle);

  let jugador = identity.displayJugador;
  const careerJugador = await attachCareerPuntosToJugador(jugador, {
    linkedJugadorIds: identity.linkedJugadorIds,
    participaciones: historialGlobal,
    viewingOrganizadorId: org,
    includeViewingOrgWithZero: hasOrgContext,
  });

  const careerFields = {
    careerPuntosByClub: careerJugador.careerPuntosByClub ?? career.byClub,
    careerPuntosTotal: careerJugador.careerPuntosTotal ?? career.total,
    multiclubGranteePuntos: careerJugador.multiclubGranteePuntos,
    ...(careerJugador.officialPuntosGlobal != null
      ? { officialPuntosGlobal: careerJugador.officialPuntosGlobal }
      : {}),
  };
  jugador = { ...jugador, ...careerFields };

  const ratingView = await loadUnifiedRatingViewForJugador(jugador, {
    limite: 10,
    organizadorId: null,
    participacionesHistorial: historialGlobal,
    fetchHistorial: obtenerHistorialRatingPublic,
    rpc: hasOrgContext ? ratingRpc : undefined,
  });

  jugador = { ...ratingView.jugador, ...careerFields };

  if (!hasOrgContext && careerJugador.officialPuntosGlobal != null) {
    const statsBase = jugador.stats ?? emptyStats(jugador.id);
    jugador = {
      ...jugador,
      stats: mergeJugadorStatsPuntosTotales(
        statsBase,
        careerJugador.officialPuntosGlobal
      ),
    };
  }

  const localContext = await resolvePlayerLocalContext(identity, jugador, {
    ratingRpc,
  });
  jugador = { ...localContext.jugador, ...careerFields };

  const pointsBreakdown = await resolvePlayerPointsBreakdown({
    jugador,
    identity,
    currentOrganizadorId: org,
    participaciones: historialGlobal,
  });
  jugador = { ...jugador, pointsBreakdown };

  const debug: PlayerIdentityDebugSnapshot | undefined = includeDebug
    ? {
        identity,
        careerRowCount: careerBundle.participaciones.length,
        careerDuplicateCount: careerBundle.duplicateCount,
        pointsByClub: career.byClub,
        careerTotal: career.total,
        historialLength: historialGlobal.length,
        ratingMovementsLength: ratingView.historial.length,
        resolutionSource: identity.resolutionSource,
      }
    : undefined;

  return {
    jugador,
    identity,
    viewingOrgId: org,
    hasOrgContext,
    localRankingPos: localContext.localRankingPos,
    historialGlobal,
    historialMain: historialGlobal,
    historialOtrosClubes: [],
    historialRating: ratingView.historial,
    career,
    debug,
  };
}

/**
 * Combina el perfil local del club (ediciones/permisos) con carrera global del motor de identidad.
 * GUARD: historial, stats y rating provienen del mismo historialGlobal que la ficha pública.
 */
export function mergeLocalJugadorWithGlobalCareer(
  localJugador: RivieraJugadorWithStats,
  globalProfile: PublicPlayerProfileData
): RivieraJugadorWithStats {
  const globalJugador = globalProfile.jugador;
  return {
    ...localJugador,
    riviera_id: globalJugador.riviera_id ?? localJugador.riviera_id,
    rating: globalJugador.rating,
    rating_partidos: globalJugador.rating_partidos,
    rating_fiabilidad: globalJugador.rating_fiabilidad,
    careerPuntosByClub: globalJugador.careerPuntosByClub,
    careerPuntosTotal: globalJugador.careerPuntosTotal,
    multiclubGranteePuntos: globalJugador.multiclubGranteePuntos,
    ...(globalJugador.officialPuntosGlobal != null
      ? { officialPuntosGlobal: globalJugador.officialPuntosGlobal }
      : {}),
    pointsBreakdown: globalJugador.pointsBreakdown,
  };
}

/**
 * Ficha admin — mismo motor global que la ficha pública.
 * Resuelve identidad por official_player_key; el perfil local conserva id/slug del club.
 */
export async function getAdminPlayerProfileData(
  params: GetAdminPlayerProfileInput
): Promise<AdminPlayerProfileData | null> {
  const org = params.organizadorId.trim();
  const slug = params.slug.trim();
  if (!org || !slug) return null;

  const localJugador =
    params.localJugador ?? (await getRivieraJugadorBySlug(org, slug));
  if (!localJugador) return null;

  const globalProfile = await getPublicPlayerProfileData({
    playerId: localJugador.id,
    viewingOrgId: org,
    historialLimit: params.historialLimit ?? 100,
    ratingRpc: params.ratingRpc,
  });
  if (!globalProfile) return null;

  const jugador = mergeLocalJugadorWithGlobalCareer(localJugador, globalProfile);

  return {
    ...globalProfile,
    jugador,
    localJugador,
    historialMain: globalProfile.historialGlobal,
    historialOtrosClubes: [],
  };
}

/** Snapshot de diagnóstico para /admin/dev/player-debug */
export async function debugPlayerIdentity(
  query: { rivieraId?: string; jugadorId?: string; slug?: string },
  viewingOrgId?: string | null
): Promise<PlayerIdentityDebugSnapshot | null> {
  const input: PlayerIdentityInput | null = query.rivieraId?.trim()
    ? { kind: "rivieraId", rivieraId: query.rivieraId.trim() }
    : query.jugadorId?.trim()
    ? { kind: "jugadorId", jugadorId: query.jugadorId.trim() }
    : query.slug?.trim()
    ? { kind: "slug", slug: query.slug.trim() }
    : null;

  if (!input) return null;

  const profile = await getPublicPlayerProfileData({
    playerId: input.kind === "jugadorId" ? input.jugadorId : undefined,
    slug: input.kind === "slug" ? input.slug : undefined,
    rivieraId: input.kind === "rivieraId" ? input.rivieraId : undefined,
    viewingOrgId: viewingOrgId ?? null,
    includeDebug: true,
  });

  return profile?.debug ?? null;
}
