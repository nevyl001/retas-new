import { waitForSupabaseSession } from "../waitForSupabaseSession";
import { supabase, supabasePublicRead } from "../supabaseClient";
import {
  fetchPublicCareerJugadorIds,
  fetchPublicIdentityRows,
} from "./publicCareerLinkage";
import type { JugadorStats, RivieraJugador, RivieraJugadorWithStats } from "./types";
import { invalidatePlayersPool } from "./playersPoolCache";

function isMissingAccessFeatureError(
  error: { code?: string; message?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("organizer_player_access") ||
    msg.includes("could not find the function")
  );
}

export interface OrganizerPlayerAccessRow {
  id: string;
  jugador_id: string;
  owner_organizador_id: string;
  local_jugador_id: string | null;
  local_display_name: string | null;
  local_category: string | null;
}

export interface AdminPlayerAccessEntry {
  id: string;
  granteeOrganizerId: string;
  granteeName: string;
  granteeEmail: string;
  isActive: boolean;
  isPublicRanking: boolean;
  localJugadorId: string | null;
  grantedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminGrantAccessResult {
  granted: number;
  reactivated: number;
  skipped: number;
}

export interface AdminOrganizerOption {
  id: string;
  name: string;
  email: string;
}

export async function listRevokedGrantLocalJugadorIds(
  granteeOrganizerId: string
): Promise<Set<string>> {
  const org = granteeOrganizerId.trim();
  if (!org) return new Set();

  const { data, error } = await supabase
    .from("organizer_player_access")
    .select("local_jugador_id")
    .eq("grantee_organizer_id", org)
    .eq("is_active", false)
    .not("local_jugador_id", "is", null);

  if (error) {
    if (isMissingAccessFeatureError(error)) return new Set();
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) =>
        row.local_jugador_id ? String(row.local_jugador_id).trim() : ""
      )
      .filter(Boolean)
  );
}

export function excludeRevokedGrantLocalClones<T extends { id: string }>(
  rows: T[],
  revokedLocalIds: Set<string>
): T[] {
  if (revokedLocalIds.size === 0) return rows;
  return rows.filter((row) => !revokedLocalIds.has(row.id));
}

export async function isRevokedGrantLocalJugador(
  granteeOrganizerId: string,
  jugadorId: string
): Promise<boolean> {
  const revoked = await listRevokedGrantLocalJugadorIds(granteeOrganizerId);
  return revoked.has(jugadorId.trim());
}

export async function listActiveGrantedAccessForOrganizerPublic(
  granteeOrganizerId: string
): Promise<OrganizerPlayerAccessRow[]> {
  const org = granteeOrganizerId.trim();
  if (!org) return [];

  for (const client of [supabasePublicRead, supabase]) {
    try {
      const { data, error } = await client.rpc("list_public_grants_for_ranking", {
        p_grantee_organizador_id: org,
      });
      if (!error && data) {
        return (data ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          jugador_id: String(row.jugador_id),
          owner_organizador_id: String(row.owner_organizador_id),
          local_jugador_id: row.local_jugador_id
            ? String(row.local_jugador_id)
            : null,
          local_display_name: row.local_display_name
            ? String(row.local_display_name)
            : null,
          local_category: row.local_category ? String(row.local_category) : null,
        }));
      }
    } catch {
      /* RPC no desplegado */
    }
  }

  return [];
}

export async function listActiveGrantedAccessForOrganizer(
  granteeOrganizerId: string
): Promise<OrganizerPlayerAccessRow[]> {
  const { data, error } = await supabase
    .from("organizer_player_access")
    .select(
      "id, jugador_id, owner_organizador_id, local_jugador_id, local_display_name, local_category"
    )
    .eq("grantee_organizer_id", granteeOrganizerId)
    .eq("is_active", true);

  if (error) {
    if (isMissingAccessFeatureError(error)) return [];
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    jugador_id: String(row.jugador_id),
    owner_organizador_id: String(row.owner_organizador_id),
    local_jugador_id: row.local_jugador_id ? String(row.local_jugador_id) : null,
    local_display_name: row.local_display_name ? String(row.local_display_name) : null,
    local_category: row.local_category ? String(row.local_category) : null,
  }));
}

export interface GrantedAccessMeta {
  accessId: string;
  sourceJugadorId: string;
  ownerOrganizadorId: string;
  localJugadorId: string | null;
  localDisplayName?: string | null;
  localCategory?: string | null;
}

export function grantedAccessFromRow(
  row: Pick<
    OrganizerPlayerAccessRow,
    "id" | "jugador_id" | "owner_organizador_id" | "local_display_name" | "local_category"
  >
): Pick<
  RivieraJugadorWithStats["grantedAccess"] & object,
  "accessId" | "sourceJugadorId" | "ownerOrganizadorId" | "localDisplayName" | "localCategory"
> {
  return {
    accessId: row.id,
    sourceJugadorId: row.jugador_id,
    ownerOrganizadorId: row.owner_organizador_id,
    localDisplayName: row.local_display_name,
    localCategory: row.local_category,
  };
}

export function grantedAccessFromMeta(
  meta: GrantedAccessMeta
): NonNullable<RivieraJugadorWithStats["grantedAccess"]> {
  return {
    accessId: meta.accessId,
    sourceJugadorId: meta.sourceJugadorId,
    ownerOrganizadorId: meta.ownerOrganizadorId,
    localDisplayName: meta.localDisplayName,
    localCategory: meta.localCategory,
  };
}

/** Grant activo por id de jugador origen o clon local (sin filtrar club anfitrión). */
export async function findGrantedAccessMetaGlobal(
  jugadorId: string
): Promise<(GrantedAccessMeta & { granteeOrganizerId: string }) | null> {
  const id = jugadorId.trim();
  if (!id) return null;

  const identityRows = await fetchPublicIdentityRows(id, null);
  if (identityRows?.length) {
    const canonical =
      identityRows.find((row) => row.canonical_jugador_id)?.canonical_jugador_id?.trim() ||
      identityRows[0]?.anchor_jugador_id?.trim() ||
      null;

    for (const row of identityRows) {
      const linked = row.linked_jugador_id?.trim();
      const org = row.linked_organizador_id?.trim();
      if (linked === id && canonical && canonical !== id && org) {
        return {
          accessId: "",
          sourceJugadorId: canonical,
          ownerOrganizadorId:
            row.home_organizador_id?.trim() || org,
          localJugadorId: id,
          granteeOrganizerId: org,
        };
      }
    }
  }

  return null;
}

export async function enrichJugadorWithGlobalGrantedAccess(
  jugador: RivieraJugadorWithStats
): Promise<RivieraJugadorWithStats> {
  const meta = await findGrantedAccessMetaGlobal(jugador.id);
  if (!meta) return jugador;

  const isLocalClone =
    meta.localJugadorId != null && meta.localJugadorId === jugador.id;
  const isConcedido =
    isLocalClone || meta.sourceJugadorId.trim() !== jugador.id.trim();

  const withMeta: RivieraJugadorWithStats = {
    ...jugador,
    concedidoPorAdmin: jugador.concedidoPorAdmin || isConcedido,
    grantedAccess: {
      accessId: meta.accessId,
      sourceJugadorId: meta.sourceJugadorId,
      ownerOrganizadorId: meta.ownerOrganizadorId,
      localDisplayName: meta.localDisplayName,
      localCategory: meta.localCategory,
    },
  };

  if (!isConcedido) return withMeta;

  const display = await loadGrantedSourceDisplayData(meta.sourceJugadorId);
  if (!display) return withMeta;

  return applyGrantedSourceDisplayToJugador(
    withMeta,
    display,
    meta.ownerOrganizadorId
  );
}

export async function findGrantedAccessMetaForJugador(
  granteeOrganizerId: string,
  jugadorId: string
): Promise<GrantedAccessMeta | null> {
  const org = granteeOrganizerId.trim();
  const id = jugadorId.trim();
  if (!org || !id) return null;

  const grants = await listActiveGrantedAccessForOrganizerPublic(org);
  const fromList = grants.find(
    (g) => g.jugador_id === id || g.local_jugador_id === id
  );
  if (fromList) {
    return {
      accessId: fromList.id,
      sourceJugadorId: fromList.jugador_id,
      ownerOrganizadorId: fromList.owner_organizador_id,
      localJugadorId: fromList.local_jugador_id,
      localDisplayName: fromList.local_display_name,
      localCategory: fromList.local_category,
    };
  }

  const { data, error } = await supabase
    .from("organizer_player_access")
    .select(
      "id, jugador_id, owner_organizador_id, local_jugador_id, local_display_name, local_category"
    )
    .eq("grantee_organizer_id", granteeOrganizerId)
    .eq("is_active", true)
    .or(`jugador_id.eq.${jugadorId},local_jugador_id.eq.${jugadorId}`)
    .maybeSingle();

  if (error) {
    if (isMissingAccessFeatureError(error)) return null;
    throw error;
  }
  if (!data) return null;

  return {
    accessId: String(data.id),
    sourceJugadorId: String(data.jugador_id),
    ownerOrganizadorId: String(data.owner_organizador_id),
    localJugadorId: data.local_jugador_id ? String(data.local_jugador_id) : null,
    localDisplayName: data.local_display_name ? String(data.local_display_name) : null,
    localCategory: data.local_category ? String(data.local_category) : null,
  };
}

export async function loadGrantedSourceDisplayData(
  sourceJugadorId: string
): Promise<{
  stats: JugadorStats | null;
  nombre: string;
  fotoUrl: string | null;
  categoria: RivieraJugador["categoria"];
  nivel: RivieraJugador["nivel"];
  rating: number;
  ratingPartidos: number;
  ratingFiabilidad: number;
} | null> {
  const [statsRes, jugadorRes] = await Promise.all([
    supabasePublicRead
      .from("jugador_stats")
      .select("*")
      .eq("jugador_id", sourceJugadorId)
      .maybeSingle(),
    supabasePublicRead
      .from("riviera_jugadores")
      .select("nombre, foto_url, categoria, nivel, rating, rating_partidos, rating_fiabilidad")
      .eq("id", sourceJugadorId)
      .maybeSingle(),
  ]);

  if (statsRes.error && !isMissingAccessFeatureError(statsRes.error)) {
    throw statsRes.error;
  }
  if (jugadorRes.error && !isMissingAccessFeatureError(jugadorRes.error)) {
    throw jugadorRes.error;
  }
  if (!statsRes.data && !jugadorRes.data) return null;

  const j = jugadorRes.data as Record<string, unknown> | null;
  return {
    stats: (statsRes.data as JugadorStats | null) ?? null,
    nombre: String(j?.nombre ?? "").trim(),
    fotoUrl:
      typeof j?.foto_url === "string" && j.foto_url.trim() ? j.foto_url.trim() : null,
    categoria: (j?.categoria as RivieraJugador["categoria"]) ?? "open",
    nivel: (j?.nivel as RivieraJugador["nivel"]) ?? "intermedio",
    rating: Number(j?.rating ?? 3),
    ratingPartidos: Number(j?.rating_partidos ?? 0),
    ratingFiabilidad: Number(j?.rating_fiabilidad ?? 0.2),
  };
}

function hasGrantedNombreOverride(
  jugador: Pick<RivieraJugadorWithStats, "grantedAccess">
): boolean {
  return Boolean(jugador.grantedAccess?.localDisplayName?.trim());
}

function hasGrantedCategoriaOverride(
  jugador: Pick<RivieraJugadorWithStats, "grantedAccess">
): boolean {
  return Boolean(jugador.grantedAccess?.localCategory?.trim());
}

export function applyGrantedSourceDisplayToJugador(
  jugador: RivieraJugadorWithStats,
  source: NonNullable<Awaited<ReturnType<typeof loadGrantedSourceDisplayData>>>,
  ownerOrganizadorId?: string | null
): RivieraJugadorWithStats {
  const nombre = hasGrantedNombreOverride(jugador)
    ? jugador.nombre
    : source.nombre || jugador.nombre;
  const categoria = hasGrantedCategoriaOverride(jugador)
    ? jugador.categoria
    : source.categoria || jugador.categoria;

  return {
    ...jugador,
    nombre,
    categoria,
    foto_url: source.fotoUrl ?? jugador.foto_url,
    nivel: source.nivel ?? jugador.nivel,
    statsOrigenConcedido: source.stats ?? null,
    rating: source.rating,
    rating_partidos: source.ratingPartidos,
    rating_fiabilidad: source.ratingFiabilidad,
    grantedAccess: jugador.grantedAccess
      ? {
          ...jugador.grantedAccess,
          ownerOrganizadorId:
            ownerOrganizadorId?.trim() ||
            jugador.grantedAccess.ownerOrganizadorId,
        }
      : undefined,
  };
}

/** Propaga identidad del origen a clones cedidos (requiere sesión + RPC desplegado). */
export async function syncGrantedLocalsFromSource(
  sourceJugadorId: string
): Promise<void> {
  const id = sourceJugadorId.trim();
  if (!id) return;

  const sessionReady = await waitForSupabaseSession();
  if (!sessionReady) {
    console.debug(
      "[riviera-jugadores] syncGrantedLocalsFromSource skipped: session not ready"
    );
    return;
  }

  const { error } = await supabase.rpc("sync_granted_locals_from_source", {
    p_source_jugador_id: id,
  });

  if (error) {
    if (isMissingAccessFeatureError(error)) {
      console.warn(
        "[riviera-jugadores] sync_granted_locals_from_source RPC not deployed"
      );
      return;
    }
    console.warn("[riviera-jugadores] syncGrantedLocalsFromSource:", error);
  }
}

export async function ensureGrantedPlayerLocal(
  sourceJugadorId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_granted_player_local", {
    p_source_jugador_id: sourceJugadorId,
  });

  if (error) {
    throw new Error(error.message || "No se pudo preparar el jugador concedido");
  }
  return String(data);
}

/**
 * Clon local de jugador concedido: siempre suma ranking interno del club anfitrión.
 * is_public_ranking solo controla visible_publico (ranking público del club).
 */
export async function ensureGrantedLocalPlayerSumsRanking(
  organizadorId: string,
  localJugadorId: string
): Promise<void> {
  const { data: grant, error: grantErr } = await supabase
    .from("organizer_player_access")
    .select("is_public_ranking")
    .eq("grantee_organizer_id", organizadorId)
    .eq("local_jugador_id", localJugadorId)
    .eq("is_active", true)
    .maybeSingle();

  if (grantErr) {
    if (isMissingAccessFeatureError(grantErr)) return;
    throw grantErr;
  }
  if (!grant) return;

  const { data: row, error: rowErr } = await supabase
    .from("riviera_jugadores")
    .select("suma_ranking, visible_publico, estado")
    .eq("id", localJugadorId)
    .maybeSingle();

  if (rowErr || !row) return;

  const patch: Record<string, boolean> = {};
  if (row.suma_ranking === false) {
    patch.suma_ranking = true;
  }
  if (grant.is_public_ranking === true && row.visible_publico === false) {
    patch.visible_publico = true;
  }
  if (Object.keys(patch).length === 0) return;

  const { error: updateErr } = await supabase
    .from("riviera_jugadores")
    .update(patch)
    .eq("id", localJugadorId);

  if (updateErr && !isMissingAccessFeatureError(updateErr)) {
    console.warn(
      "[riviera-jugadores] ensureGrantedLocalPlayerSumsRanking:",
      updateErr
    );
  }
}

/** Asegura clon local + suma_ranking para cada cedido antes de sync/backfill de puntos. */
export async function prepareGrantedPlayersForParticipacionSync(
  granteeOrganizerId: string
): Promise<string[]> {
  const org = granteeOrganizerId.trim();
  if (!org) return [];

  const grants = await listActiveGrantedAccessForOrganizer(org);
  const localIds: string[] = [];

  for (const grant of grants) {
    try {
      const sourceId = grant.jugador_id.trim();
      if (!sourceId) continue;

      let localId = grant.local_jugador_id?.trim() || null;
      if (!localId) {
        localId = await ensureGrantedPlayerLocal(sourceId);
      }
      await ensureGrantedLocalPlayerSumsRanking(org, localId);
      localIds.push(localId);
    } catch (e) {
      console.warn(
        "[riviera-jugadores] prepareGrantedPlayersForParticipacionSync:",
        grant.jugador_id,
        e
      );
    }
  }

  return localIds;
}

export async function listGrantedLocalJugadorIdsForSource(
  sourceJugadorId: string
): Promise<string[]> {
  const grants = await listGranteeClubsForSourceJugador(sourceJugadorId);
  return grants.map((g) => g.localJugadorId);
}

export async function listGranteeClubsForSourceJugador(
  sourceJugadorId: string
): Promise<Array<{ granteeOrganizadorId: string; localJugadorId: string }>> {
  const id = sourceJugadorId.trim();
  if (!id) return [];

  const identityRows = await fetchPublicIdentityRows(id, null);
  if (identityRows?.length) {
    const byLocal = new Map<string, string>();
    for (const row of identityRows) {
      const linked = row.linked_jugador_id?.trim();
      const org = row.linked_organizador_id?.trim();
      if (!linked || linked === id || !org) continue;
      byLocal.set(linked, org);
    }
    if (byLocal.size > 0) {
      return Array.from(byLocal.entries()).map(([localJugadorId, granteeOrganizadorId]) => ({
        granteeOrganizadorId,
        localJugadorId,
      }));
    }
  }

  const careerIds = await fetchPublicCareerJugadorIds(id);
  if (!careerIds || careerIds.length <= 1) return [];

  const byLocal = new Map<string, string>();
  const { data, error } = await supabasePublicRead
    .from("riviera_jugadores")
    .select("id, organizador_id")
    .in("id", careerIds.filter((jid) => jid !== id))
    .eq("estado", "activo");

  if (error) {
    console.warn("[riviera-jugadores] listGranteeClubsForSourceJugador:", error);
    return [];
  }

  for (const row of data ?? []) {
    const localJugadorId = String((row as { id?: string }).id ?? "").trim();
    const granteeOrganizadorId = String(
      (row as { organizador_id?: string }).organizador_id ?? ""
    ).trim();
    if (localJugadorId && granteeOrganizadorId) {
      byLocal.set(localJugadorId, granteeOrganizadorId);
    }
  }

  return Array.from(byLocal.entries()).map(([localJugadorId, granteeOrganizadorId]) => ({
    granteeOrganizadorId,
    localJugadorId,
  }));
}

async function listSiblingJugadorIdsViaProfileLink(
  sourceJugadorId: string
): Promise<string[]> {
  const sourceId = sourceJugadorId.trim();
  if (!sourceId) return [];

  const identityRows = await fetchPublicIdentityRows(sourceId, null);
  if (identityRows?.length) {
    return Array.from(
      new Set(
        identityRows
          .map((row) => row.linked_jugador_id?.trim() ?? "")
          .filter((linked) => linked && linked !== sourceId)
      )
    );
  }

  const careerIds = await fetchPublicCareerJugadorIds(sourceId);
  if (!careerIds) return [];

  return careerIds.filter((linked) => linked && linked !== sourceId);
}

/** Perfiles del mismo jugador en otros clubes (grants + misma Carrera / profile_link). */
export async function listMulticlubSiblingProfilesForSource(
  sourceJugadorId: string
): Promise<Array<{ jugadorId: string; organizadorId: string }>> {
  const sourceId = sourceJugadorId.trim();
  if (!sourceId) return [];

  const byId = new Map<string, string>();

  for (const grant of await listGranteeClubsForSourceJugador(sourceId)) {
    byId.set(grant.localJugadorId, grant.granteeOrganizadorId);
  }

  const siblingIds = await listSiblingJugadorIdsViaProfileLink(sourceId);
  if (siblingIds.length > 0) {
    const { data: siblings, error: sibErr } = await supabasePublicRead
      .from("riviera_jugadores")
      .select("id, organizador_id")
      .in("id", siblingIds)
      .eq("estado", "activo");

    if (!sibErr) {
      for (const row of siblings ?? []) {
        const id = String((row as { id?: string }).id ?? "").trim();
        const org = String(
          (row as { organizador_id?: string }).organizador_id ?? ""
        ).trim();
        if (id && org && !byId.has(id)) byId.set(id, org);
      }
    }
  }

  return Array.from(byId.entries()).map(([jugadorId, organizadorId]) => ({
    jugadorId,
    organizadorId,
  }));
}

/** Resuelve el id operativo del jugador para el organizador actual. */
export async function resolveJugadorIdForOrganizer(
  organizadorId: string,
  jugadorId: string
): Promise<string> {
  const { data: own, error: ownErr } = await supabase
    .from("riviera_jugadores")
    .select("id")
    .eq("id", jugadorId)
    .eq("organizador_id", organizadorId)
    .maybeSingle();

  if (ownErr && !isMissingAccessFeatureError(ownErr)) throw ownErr;
  if (own?.id) return String(own.id);

  const { data: grant, error: grantErr } = await supabase
    .from("organizer_player_access")
    .select("id, local_jugador_id, jugador_id")
    .eq("grantee_organizer_id", organizadorId)
    .eq("is_active", true)
    .or(`jugador_id.eq.${jugadorId},local_jugador_id.eq.${jugadorId}`)
    .maybeSingle();

  if (grantErr) {
    if (isMissingAccessFeatureError(grantErr)) return jugadorId;
    throw grantErr;
  }
  if (!grant) return jugadorId;

  if (grant.local_jugador_id) {
    const localId = String(grant.local_jugador_id);
    await ensureGrantedLocalPlayerSumsRanking(organizadorId, localId);
    return localId;
  }

  const sourceId =
    String(grant.jugador_id) === jugadorId
      ? jugadorId
      : String(grant.jugador_id);
  const localId = await ensureGrantedPlayerLocal(sourceId);
  await ensureGrantedLocalPlayerSumsRanking(organizadorId, localId);
  return localId;
}

/**
 * Rating global del jugador: cedidos en club anfitrión → perfil origen (canónico).
 * Puntos/participaciones siguen en el clon local; el nivel viaja con el jugador.
 */
export async function resolveJugadorIdForRating(
  organizadorId: string,
  jugadorId: string
): Promise<string> {
  const resolved = await resolveJugadorIdForOrganizer(organizadorId, jugadorId);
  const meta = await findGrantedAccessMetaForJugador(organizadorId, resolved);
  if (
    meta?.sourceJugadorId &&
    meta.localJugadorId &&
    meta.localJugadorId === resolved
  ) {
    return meta.sourceJugadorId;
  }
  return resolved;
}

export async function adminGrantOrganizerPlayerAccess(
  jugadorIds: string[],
  granteeOrganizerId: string,
  isPublicRanking = false
): Promise<AdminGrantAccessResult> {
  const { data, error } = await supabase.rpc(
    "admin_grant_organizer_player_access",
    {
      p_jugador_ids: jugadorIds,
      p_grantee_organizer_id: granteeOrganizerId,
      p_is_public_ranking: isPublicRanking,
    }
  );

  if (error) {
    throw new Error(error.message || "No se pudo otorgar acceso");
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const result = {
    granted: Number(raw.granted ?? 0),
    reactivated: Number(raw.reactivated ?? 0),
    skipped: Number(raw.skipped ?? 0),
  };
  if (result.granted > 0 || result.reactivated > 0) {
    invalidatePlayersPool(granteeOrganizerId);
  }
  return result;
}

export async function adminRevokeOrganizerPlayerAccess(
  accessId: string
): Promise<void> {
  let granteeOrganizerId: string | null = null;
  try {
    const { data: row } = await supabase
      .from("organizer_player_access")
      .select("grantee_organizer_id")
      .eq("id", accessId)
      .maybeSingle();
    granteeOrganizerId = row?.grantee_organizer_id
      ? String(row.grantee_organizer_id)
      : null;
  } catch {
    granteeOrganizerId = null;
  }

  const { error } = await supabase.rpc("admin_revoke_organizer_player_access", {
    p_access_id: accessId,
  });
  if (error) {
    throw new Error(error.message || "No se pudo quitar el acceso");
  }
  if (granteeOrganizerId) {
    invalidatePlayersPool(granteeOrganizerId);
  }
}

export async function adminListOrganizerPlayerAccess(
  jugadorId: string
): Promise<AdminPlayerAccessEntry[]> {
  const { data, error } = await supabase.rpc(
    "admin_list_organizer_player_access",
    { p_jugador_id: jugadorId }
  );

  if (error) {
    if (isMissingAccessFeatureError(error)) return [];
    throw new Error(error.message || "No se pudieron cargar los accesos");
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    granteeOrganizerId: String(row.grantee_organizer_id),
    granteeName: String(row.grantee_name ?? ""),
    granteeEmail: String(row.grantee_email ?? ""),
    isActive: row.is_active === true,
    isPublicRanking: row.is_public_ranking === true,
    localJugadorId: row.local_jugador_id ? String(row.local_jugador_id) : null,
    grantedByAdminId: row.granted_by_admin_id
      ? String(row.granted_by_admin_id)
      : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }));
}

export async function searchOrganizersForGrant(
  query: string,
  excludeOrganizadorId?: string
): Promise<AdminOrganizerOption[]> {
  const q = query.trim().toLowerCase();
  let req = supabase
    .from("users")
    .select("id, name, email")
    .order("name")
    .limit(25);

  if (q) {
    req = req.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error } = await req;
  if (error) throw new Error(error.message || "No se pudieron buscar organizadores");

  return (data ?? [])
    .filter((u) => u.id !== excludeOrganizadorId)
    .map((u) => ({
      id: String(u.id),
      name: String(u.name ?? u.email ?? "Organizador"),
      email: String(u.email ?? ""),
    }));
}

export async function resolveGrantedJugadorForOrganizerUse(
  organizadorId: string,
  jugador: RivieraJugador
): Promise<RivieraJugador> {
  const effectiveId = await resolveJugadorIdForOrganizer(
    organizadorId,
    jugador.id
  );
  if (effectiveId === jugador.id) return jugador;

  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("*")
    .eq("id", effectiveId)
    .maybeSingle();

  if (error || !data) return jugador;
  return data as RivieraJugador;
}

export function isGrantedJugadorRow(
  jugador: RivieraJugador | RivieraJugadorWithStats
): boolean {
  return Boolean(
    (jugador as RivieraJugadorWithStats).concedidoPorAdmin ||
      (jugador as RivieraJugadorWithStats).grantedAccess
  );
}
