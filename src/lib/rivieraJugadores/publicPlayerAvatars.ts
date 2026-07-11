import { isMissingColumnError } from "../db/schemaHelpers";
import { supabase, supabasePublicRead } from "../supabaseClient";
import { normalizePlayerNameKey } from "./playerNameKey";

export type PlayerAvatarLookupEntry = { id: string; name: string };

export type PlayerPublicProfile = {
  fotoUrl: string | null;
  rating: number;
};

const DEFAULT_PROFILE: PlayerPublicProfile = { fotoUrl: null, rating: 3.0 };

function isDefaultRating(rating: number): boolean {
  return rating === DEFAULT_PROFILE.rating;
}

function preferCanonicalRating(current: number, incoming: number): number {
  if (!isDefaultRating(current) && isDefaultRating(incoming)) {
    return current;
  }
  if (!isDefaultRating(incoming)) {
    return incoming;
  }
  return current;
}

function normalizeRating(raw: unknown): number {
  if (raw != null && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return 3.0;
}

function profileFromRow(row: Record<string, unknown>): PlayerPublicProfile {
  const foto =
    typeof row.foto_url === "string" && row.foto_url.trim()
      ? row.foto_url.trim()
      : null;
  return {
    fotoUrl: foto,
    rating: normalizeRating(row.rating),
  };
}

function mergeProfile(
  current: PlayerPublicProfile,
  incoming: PlayerPublicProfile
): PlayerPublicProfile {
  return {
    fotoUrl: current.fotoUrl ?? incoming.fotoUrl,
    rating: preferCanonicalRating(current.rating, incoming.rating),
  };
}

type LegacyProfileRow = {
  organizador_id?: string | null;
  legacy_player_id?: string | null;
  nombre?: string | null;
  foto_url?: unknown;
  rating?: unknown;
  rating_partidos?: unknown;
};

type OrganizadorRivieraRow = {
  id?: string;
  legacy_player_id?: string | null;
  nombre?: string | null;
  foto_url?: unknown;
  rating?: unknown;
};

function entryNameKey(name?: string): string {
  const trimmed = name?.trim();
  return trimmed ? normalizePlayerNameKey(trimmed) : "";
}

function rowsLinkedToEntryId(
  rows: OrganizadorRivieraRow[],
  entryId: string
): OrganizadorRivieraRow[] {
  const id = entryId.trim();
  if (!id) return [];
  return rows.filter(
    (row) =>
      String(row.legacy_player_id ?? "").trim() === id ||
      String(row.id ?? "").trim() === id
  );
}

function rowsMatchingEventName(
  rows: OrganizadorRivieraRow[],
  eventName?: string
): OrganizadorRivieraRow[] {
  const key = entryNameKey(eventName);
  if (!key) return [];
  return rows.filter(
    (row) => normalizePlayerNameKey(String(row.nombre ?? "")) === key
  );
}

/**
 * Perfil del organizador por legacy `players.id` (id único). Sin resolver por nombre.
 */
function resolveOrganizadorRowForEventEntry(
  rows: OrganizadorRivieraRow[],
  entry: PlayerAvatarLookupEntry
): OrganizadorRivieraRow | null {
  if (!rows.length) return null;

  const linked = rowsLinkedToEntryId(rows, entry.id);
  if (linked.length === 1) {
    return linked[0]!;
  }

  if (linked.length > 1) {
    const nameKey = entryNameKey(entry.name);
    if (nameKey) {
      const linkedByName = rowsMatchingEventName(linked, entry.name);
      if (linkedByName.length === 1) return linkedByName[0]!;
    }
    return linked[0] ?? null;
  }

  return null;
}

/** Mismo legacy_player_id en varios clubes: más historial de rating; empate → club anfitrión. */
function pickCanonicalLegacyProfileRow(
  organizadorId: string,
  rows: LegacyProfileRow[],
  eventName?: string
): LegacyProfileRow | null {
  if (!rows.length) return null;

  const nameKey = entryNameKey(eventName);
  let pool = rows;
  if (nameKey) {
    const byName = rows.filter(
      (row) => normalizePlayerNameKey(String(row.nombre ?? "")) === nameKey
    );
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) pool = byName;
  }

  const host = organizadorId.trim();
  const sorted = [...pool].sort((a, b) => {
    const ap = Number(a.rating_partidos ?? 0);
    const bp = Number(b.rating_partidos ?? 0);
    if (bp !== ap) return bp - ap;
    const ar = normalizeRating(a.rating);
    const br = normalizeRating(b.rating);
    if (!isDefaultRating(ar) && isDefaultRating(br)) return -1;
    if (!isDefaultRating(br) && isDefaultRating(ar)) return 1;
    const aHost = host && String(a.organizador_id ?? "").trim() === host ? 1 : 0;
    const bHost = host && String(b.organizador_id ?? "").trim() === host ? 1 : 0;
    if (bHost !== aHost) return bHost - aHost;
    return br - ar;
  });
  return sorted[0] ?? null;
}

async function fetchCanonicalProfilesByLegacyPlayerIds(
  organizadorId: string,
  legacyIds: string[],
  options?: {
    allowAuthenticatedFallback?: boolean;
    eventNameByLegacyId?: Map<string, string>;
  }
): Promise<Map<string, PlayerPublicProfile>> {
  const map = new Map<string, PlayerPublicProfile>();
  const ids = Array.from(new Set(legacyIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  const cols =
    "legacy_player_id, organizador_id, nombre, foto_url, rating, rating_partidos";
  const rowMap = new Map<string, LegacyProfileRow[]>();

  const ingest = (rows: LegacyProfileRow[] | null | undefined) => {
    for (const row of rows ?? []) {
      const legacy = String(row.legacy_player_id ?? "").trim();
      if (!legacy) continue;
      const list = rowMap.get(legacy) ?? [];
      list.push(row);
      rowMap.set(legacy, list);
    }
  };

  const { data: publicData, error: publicError } = await supabasePublicRead
    .from("riviera_jugadores")
    .select(cols)
    .in("legacy_player_id", ids)
    .eq("estado", "activo");

  if (publicError) {
    console.warn(
      "[publicPlayerAvatars] canonical legacy public read:",
      publicError.message
    );
  } else {
    ingest(publicData as LegacyProfileRow[]);
  }

  if (options?.allowAuthenticatedFallback) {
    const missing = ids.filter((id) => {
      const picked = pickCanonicalLegacyProfileRow(
        organizadorId,
        rowMap.get(id) ?? []
      );
      return !picked || isDefaultRating(normalizeRating(picked.rating));
    });
    if (missing.length > 0) {
      const { data: authData, error: authError } = await supabase
        .from("riviera_jugadores")
        .select(cols)
        .in("legacy_player_id", missing)
        .eq("estado", "activo");
      if (authError) {
        console.warn(
          "[publicPlayerAvatars] canonical legacy auth read:",
          authError.message
        );
      } else {
        ingest(authData as LegacyProfileRow[]);
      }
    }
  }

  for (const legacyId of ids) {
    const picked = pickCanonicalLegacyProfileRow(
      organizadorId,
      rowMap.get(legacyId) ?? [],
      options?.eventNameByLegacyId?.get(legacyId)
    );
    if (picked) {
      map.set(legacyId, profileFromRow(picked as Record<string, unknown>));
    }
  }

  return map;
}

type AvatarReadContext = {
  client: typeof supabase;
  applyVisiblePublicoFilter: boolean;
};

async function getSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function getAvatarReadContext(opts?: {
  publicOnly?: boolean;
  organizadorId?: string;
}): Promise<AvatarReadContext> {
  if (opts?.publicOnly && opts.organizadorId) {
    const uid = await getSessionUserId();
    if (uid === opts.organizadorId) {
      return { client: supabase, applyVisiblePublicoFilter: false };
    }
    return { client: supabasePublicRead, applyVisiblePublicoFilter: false };
  }
  if (opts?.publicOnly) {
    return { client: supabasePublicRead, applyVisiblePublicoFilter: false };
  }
  return { client: supabase, applyVisiblePublicoFilter: false };
}

async function fetchEventAvatarsByRivieraIds(
  ids: string[],
  organizadorId?: string
): Promise<Map<string, PlayerPublicProfile>> {
  const map = new Map<string, PlayerPublicProfile>();
  if (ids.length === 0) return map;

  const rpcAttempts: Array<{
    client: typeof supabase;
    name: string;
    params: Record<string, unknown>;
    mapRow: (row: Record<string, unknown>) => { key: string; profile: PlayerPublicProfile };
  }> = [];

  if (organizadorId?.trim()) {
    rpcAttempts.push({
      client: supabasePublicRead,
      name: "riviera_public_riviera_jugador_profiles",
      params: {
        p_organizador_id: organizadorId,
        p_jugador_ids: ids,
      },
      mapRow: (row) => ({
        key: String(row.jugador_id),
        profile: profileFromRow(row),
      }),
    });
    rpcAttempts.push({
      client: supabasePublicRead,
      name: "riviera_event_player_avatars",
      params: {
        p_organizador_id: organizadorId,
        p_jugador_ids: ids,
      },
      mapRow: (row) => ({
        key: String(row.id),
        profile: profileFromRow(row),
      }),
    });
  }

  rpcAttempts.push({
    client: supabase,
    name: "riviera_event_player_avatars",
    params: { p_jugador_ids: ids },
    mapRow: (row) => ({
      key: String(row.id),
      profile: profileFromRow(row),
    }),
  });

  for (const attempt of rpcAttempts) {
    const { data, error } = await attempt.client.rpc(
      attempt.name,
      attempt.params
    );

    if (error) {
      if (
        !error.message?.includes(attempt.name) &&
        !error.message?.includes("Could not find the function")
      ) {
        console.warn(`[publicPlayerAvatars] ${attempt.name}:`, error.message);
      }
      continue;
    }

    for (const row of data ?? []) {
      const mapped = attempt.mapRow(row as Record<string, unknown>);
      map.set(mapped.key, mapped.profile);
    }
    if (map.size > 0) return map;
  }

  return map;
}

function legacyLookupIds(
  entryIds: string[],
  legacyKeyByEntryId: Map<string, string>,
  rivieraIdByEntryId?: Map<string, string>
): string[] {
  const ids = new Set<string>();
  for (const entryId of entryIds) {
    const legacyKey = legacyKeyByEntryId.get(entryId) ?? entryId;
    if (legacyKey) ids.add(legacyKey);
    const rivieraId = rivieraIdByEntryId?.get(entryId);
    if (rivieraId) ids.add(rivieraId);
    ids.add(entryId);
  }
  return Array.from(ids);
}

function applyPublicLegacyRpcProfiles(
  result: Record<string, PlayerPublicProfile>,
  entryIds: string[],
  legacyKeyByEntryId: Map<string, string>,
  rivieraIdByEntryId: Map<string, string>,
  fromRpc: Map<string, PlayerPublicProfile>
): void {
  for (const entryId of entryIds) {
    const legacyKey = legacyKeyByEntryId.get(entryId) ?? entryId;
    const rivieraId = rivieraIdByEntryId.get(entryId);
    const profile =
      fromRpc.get(legacyKey) ??
      (rivieraId ? fromRpc.get(rivieraId) : undefined) ??
      fromRpc.get(entryId);
    if (profile) {
      result[entryId] = mergeProfile(result[entryId] ?? { ...DEFAULT_PROFILE }, profile);
    }
  }
}

async function fetchPublicEventLegacyProfiles(
  organizadorId: string,
  legacyIds: string[]
): Promise<Map<string, PlayerPublicProfile>> {
  const map = new Map<string, PlayerPublicProfile>();
  const ids = Array.from(new Set(legacyIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  const rpcNames = [
    "riviera_public_event_legacy_player_profiles",
    "riviera_event_legacy_player_avatars",
  ] as const;

  for (const rpcName of rpcNames) {
    const { data, error } = await supabasePublicRead.rpc(rpcName, {
      p_organizador_id: organizadorId,
      p_legacy_player_ids: ids,
    });

    if (error) {
      if (
        !error.message?.includes(rpcName) &&
        !error.message?.includes("Could not find the function")
      ) {
        console.warn(`[publicPlayerAvatars] ${rpcName}:`, error.message);
      }
      continue;
    }

    for (const row of data ?? []) {
      const legacyId = String(
        (row as { legacy_player_id: string }).legacy_player_id
      );
      map.set(legacyId, profileFromRow(row as Record<string, unknown>));
    }
    if (map.size > 0) return map;
  }

  return map;
}

function profileNeedsCanonicalLookup(profile: PlayerPublicProfile): boolean {
  // Rating real del club local: no reemplazar por otro club.
  // Pero si falta foto, sí buscar en RPC/canónico (cedidos u origen).
  return !profile.fotoUrl || isDefaultRating(profile.rating);
}

function idsNeedingEventProfileRpc(
  result: Record<string, PlayerPublicProfile>,
  entries: PlayerAvatarLookupEntry[],
  _publicOnly?: boolean
): string[] {
  return entries
    .filter((e) => {
      const profile = result[e.id] ?? DEFAULT_PROFILE;
      return profileNeedsCanonicalLookup(profile);
    })
    .map((e) => e.id);
}

/**
 * Resuelve foto y rating por legacy_player_id o id de riviera_jugadores (nunca solo por nombre).
 * `publicOnly`: vistas /public/... — rating canónico del perfil origen para cedidos.
 */
export async function resolvePlayerPublicProfiles(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  opts?: { publicOnly?: boolean }
): Promise<Record<string, PlayerPublicProfile>> {
  const result: Record<string, PlayerPublicProfile> = {};
  for (const e of entries) result[e.id] = { ...DEFAULT_PROFILE };
  if (!organizadorId || entries.length === 0) return result;

  const { client, applyVisiblePublicoFilter } = await getAvatarReadContext({
    ...opts,
    organizadorId,
  });

  let q = client
    .from("riviera_jugadores")
    .select("id, legacy_player_id, nombre, foto_url, rating")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo");

  if (applyVisiblePublicoFilter) {
    q = q.eq("visible_publico", true);
  }

  let { data, error } = await q;
  if (
    error &&
    isMissingColumnError(error, "riviera_jugadores", "rating")
  ) {
    let qBase = client
      .from("riviera_jugadores")
      .select("id, legacy_player_id, nombre, foto_url")
      .eq("organizador_id", organizadorId)
      .eq("estado", "activo");
    if (applyVisiblePublicoFilter) {
      qBase = qBase.eq("visible_publico", true);
    }
    const retry = await qBase;
    data = retry.data as typeof data;
    error = retry.error;
  }

  const legacyKeyByEntryId = new Map<string, string>();
  const rivieraIdByEntryId = new Map<string, string>();
  const eventNameByEntryId = new Map(
    entries.map((e) => [e.id, e.name?.trim() ?? ""])
  );

  if (!error && data) {
    const orgRows = data as OrganizadorRivieraRow[];

    for (const e of entries) {
      const picked = resolveOrganizadorRowForEventEntry(orgRows, e);
      if (picked) {
        result[e.id] = profileFromRow(picked as Record<string, unknown>);
        const legacyKey = String(picked.legacy_player_id ?? picked.id ?? e.id);
        legacyKeyByEntryId.set(e.id, legacyKey);
        const rivieraId = String(picked.id ?? "").trim();
        if (rivieraId) rivieraIdByEntryId.set(e.id, rivieraId);
      } else {
        result[e.id] = { ...DEFAULT_PROFILE };
        legacyKeyByEntryId.set(e.id, e.id);
      }
    }
  }

  const needsCanonical = idsNeedingEventProfileRpc(
    result,
    entries,
    opts?.publicOnly
  );
  if (needsCanonical.length > 0) {
    const eventNameByLegacyId = new Map<string, string>();
    for (const id of needsCanonical) {
      const legacyKey = legacyKeyByEntryId.get(id) ?? id;
      const eventName = eventNameByEntryId.get(id);
      if (eventName) {
        eventNameByLegacyId.set(legacyKey, eventName);
      }
    }

    if (opts?.publicOnly) {
      const fromRpcFirst = await fetchPublicEventLegacyProfiles(
        organizadorId,
        legacyLookupIds(needsCanonical, legacyKeyByEntryId, rivieraIdByEntryId)
      );
      applyPublicLegacyRpcProfiles(
        result,
        needsCanonical,
        legacyKeyByEntryId,
        rivieraIdByEntryId,
        fromRpcFirst
      );
    }

    const stillNeedCanon = needsCanonical.filter((id) =>
      profileNeedsCanonicalLookup(result[id] ?? DEFAULT_PROFILE)
    );

    if (stillNeedCanon.length > 0) {
      const canonicalIds = legacyLookupIds(
        stillNeedCanon,
        legacyKeyByEntryId,
        rivieraIdByEntryId
      );
      const fromLegacyCanon = await fetchCanonicalProfilesByLegacyPlayerIds(
        organizadorId,
        canonicalIds,
        {
          allowAuthenticatedFallback: client === supabase,
          eventNameByLegacyId,
        }
      );
      for (const id of stillNeedCanon) {
        const legacyKey = legacyKeyByEntryId.get(id) ?? id;
        const rivieraId = rivieraIdByEntryId.get(id);
        const profile =
          fromLegacyCanon.get(legacyKey) ??
          (rivieraId ? fromLegacyCanon.get(rivieraId) : undefined) ??
          fromLegacyCanon.get(id);
        if (profile) {
          result[id] = mergeProfile(result[id] ?? { ...DEFAULT_PROFILE }, profile);
        }
      }
    }

    const stillDefault = needsCanonical.filter((id) =>
      isDefaultRating(result[id]?.rating ?? DEFAULT_PROFILE.rating)
    );
    if (stillDefault.length > 0 && !opts?.publicOnly) {
      const fromRpc = await fetchPublicEventLegacyProfiles(
        organizadorId,
        legacyLookupIds(stillDefault, legacyKeyByEntryId, rivieraIdByEntryId)
      );
      applyPublicLegacyRpcProfiles(
        result,
        stillDefault,
        legacyKeyByEntryId,
        rivieraIdByEntryId,
        fromRpc
      );
    }
  }

  return result;
}

/** Perfiles por id de riviera_jugadores (duelos 2v2, etc.). */
export async function fetchRivieraJugadorProfilesByIds(
  ids: (string | null)[],
  opts?: { publicOnly?: boolean; organizadorId?: string }
): Promise<Map<string, PlayerPublicProfile>> {
  const valid = Array.from(
    new Set(ids.filter((id): id is string => Boolean(id)))
  );
  const map = new Map<string, PlayerPublicProfile>();
  for (const id of valid) map.set(id, { ...DEFAULT_PROFILE });
  if (valid.length === 0) return map;

  const { client } = await getAvatarReadContext(opts);

  let { data, error } = await client
    .from("riviera_jugadores")
    .select("id, legacy_player_id, foto_url, rating, rating_partidos")
    .in("id", valid);

  if (
    error &&
    isMissingColumnError(error, "riviera_jugadores", "rating")
  ) {
    const retry = await client
      .from("riviera_jugadores")
      .select("id, legacy_player_id, foto_url")
      .in("id", valid);
    data = retry.data as typeof data;
    error = retry.error;
  }

  const legacyByRivieraId = new Map<string, string>();
  if (!error && data) {
    for (const row of data) {
      const rivieraId = String(row.id);
      map.set(rivieraId, profileFromRow(row as Record<string, unknown>));
      if (row.legacy_player_id) {
        legacyByRivieraId.set(rivieraId, String(row.legacy_player_id));
      }
    }
  }

  const needsCanon = opts?.publicOnly
    ? valid
    : valid.filter((id) => {
        const profile = map.get(id) ?? DEFAULT_PROFILE;
        return !profile.fotoUrl || isDefaultRating(profile.rating);
      });

  if (needsCanon.length > 0 && opts?.publicOnly && opts.organizadorId?.trim()) {
    const fromRivieraRpc = await fetchEventAvatarsByRivieraIds(
      needsCanon,
      opts.organizadorId
    );
    for (const rivieraId of needsCanon) {
      const profile = fromRivieraRpc.get(rivieraId);
      if (profile) {
        map.set(
          rivieraId,
          mergeProfile(map.get(rivieraId) ?? { ...DEFAULT_PROFILE }, profile)
        );
      }
    }
  }

  const stillNeedCanon = needsCanon.filter((id) =>
    profileNeedsCanonicalLookup(map.get(id) ?? DEFAULT_PROFILE)
  );

  if (stillNeedCanon.length > 0) {
    const canonIds = Array.from(
      new Set(
        stillNeedCanon
          .map((id) => legacyByRivieraId.get(id) ?? id)
          .filter(Boolean)
      )
    );

    if (opts?.publicOnly && opts.organizadorId?.trim()) {
      const fromPublicRpc = await fetchPublicEventLegacyProfiles(
        opts.organizadorId,
        canonIds
      );
      for (const rivieraId of stillNeedCanon) {
        const legacyId = legacyByRivieraId.get(rivieraId) ?? rivieraId;
        const profile =
          fromPublicRpc.get(legacyId) ?? fromPublicRpc.get(rivieraId);
        if (profile) {
          map.set(
            rivieraId,
            mergeProfile(map.get(rivieraId) ?? { ...DEFAULT_PROFILE }, profile)
          );
        }
      }
    }

    const stillAfterLegacyRpc = stillNeedCanon.filter((id) =>
      profileNeedsCanonicalLookup(map.get(id) ?? DEFAULT_PROFILE)
    );

    if (stillAfterLegacyRpc.length > 0) {
      const legacyCanonIds = Array.from(
        new Set(
          stillAfterLegacyRpc
            .map((id) => legacyByRivieraId.get(id) ?? id)
            .filter(Boolean)
        )
      );
      const fromLegacyCanon = await fetchCanonicalProfilesByLegacyPlayerIds(
        opts?.organizadorId ?? "",
        legacyCanonIds,
        { allowAuthenticatedFallback: client === supabase }
      );
      for (const rivieraId of stillAfterLegacyRpc) {
        const legacyId = legacyByRivieraId.get(rivieraId) ?? rivieraId;
        const profile =
          fromLegacyCanon.get(legacyId) ?? fromLegacyCanon.get(rivieraId);
        if (profile) {
          map.set(
            rivieraId,
            mergeProfile(map.get(rivieraId) ?? { ...DEFAULT_PROFILE }, profile)
          );
        }
      }
    }

    const stillDefault = stillNeedCanon.filter((id) =>
      isDefaultRating(map.get(id)?.rating ?? DEFAULT_PROFILE.rating)
    );
    if (stillDefault.length > 0 && !opts?.publicOnly) {
      const fromRpc = await fetchEventAvatarsByRivieraIds(
        stillDefault,
        opts?.organizadorId
      );
      for (const id of stillDefault) {
        const profile = fromRpc.get(id);
        if (profile) {
          map.set(
            id,
            mergeProfile(map.get(id) ?? { ...DEFAULT_PROFILE }, profile)
          );
        }
      }
    }
  }

  return map;
}

export async function resolvePlayerAvatars(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  opts?: { publicOnly?: boolean }
): Promise<Record<string, string | null>> {
  const profiles = await resolvePlayerPublicProfiles(
    organizadorId,
    entries,
    opts
  );
  const result: Record<string, string | null> = {};
  for (const e of entries) {
    result[e.id] = profiles[e.id]?.fotoUrl ?? null;
  }
  return result;
}
