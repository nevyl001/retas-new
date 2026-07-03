import { isMissingColumnError } from "../db/schemaHelpers";
import { supabase, supabasePublicRead } from "../supabaseClient";

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
  foto_url?: unknown;
  rating?: unknown;
  rating_partidos?: unknown;
};

/** Mismo legacy_player_id en varios clubes: más historial de rating; empate → club anfitrión. */
function pickCanonicalLegacyProfileRow(
  organizadorId: string,
  rows: LegacyProfileRow[]
): LegacyProfileRow | null {
  if (!rows.length) return null;
  const host = organizadorId.trim();
  const sorted = [...rows].sort((a, b) => {
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
  options?: { allowAuthenticatedFallback?: boolean }
): Promise<Map<string, PlayerPublicProfile>> {
  const map = new Map<string, PlayerPublicProfile>();
  const ids = Array.from(new Set(legacyIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  const cols =
    "legacy_player_id, organizador_id, foto_url, rating, rating_partidos";
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
      rowMap.get(legacyId) ?? []
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
  ids: string[]
): Promise<Map<string, PlayerPublicProfile>> {
  const map = new Map<string, PlayerPublicProfile>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase.rpc("riviera_event_player_avatars", {
    p_jugador_ids: ids,
  });

  if (error) {
    if (!error.message?.includes("riviera_event_player_avatars")) {
      console.warn("[publicPlayerAvatars] riviera_event_player_avatars:", error.message);
    }
    return map;
  }

  for (const row of data ?? []) {
    const profile = profileFromRow(row as Record<string, unknown>);
    map.set(String((row as { id: string }).id), profile);
  }
  return map;
}

function legacyLookupIds(
  entryIds: string[],
  legacyKeyByEntryId: Map<string, string>
): string[] {
  return Array.from(
    new Set(
      entryIds.map((id) => legacyKeyByEntryId.get(id) ?? id).filter(Boolean)
    )
  );
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

function idsNeedingEventProfileRpc(
  result: Record<string, PlayerPublicProfile>,
  entries: PlayerAvatarLookupEntry[],
  publicOnly?: boolean
): string[] {
  return entries
    .filter((e) => {
      const profile = result[e.id] ?? DEFAULT_PROFILE;
      if (publicOnly) {
        // Jugador propio del club con rating real: no buscar en otros clubes.
        return isDefaultRating(profile.rating);
      }
      return !profile.fotoUrl || isDefaultRating(profile.rating);
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

  if (!error && data) {
    const byLegacyId = new Map<string, PlayerPublicProfile>();
    const byRivieraId = new Map<string, PlayerPublicProfile>();

    for (const row of data) {
      const profile = profileFromRow(row as Record<string, unknown>);
      if (row.id) {
        byRivieraId.set(String(row.id), profile);
      }
      if (row.legacy_player_id) {
        const legacyId = String(row.legacy_player_id);
        byLegacyId.set(legacyId, profile);
        if (row.id) {
          legacyKeyByEntryId.set(String(row.id), legacyId);
        }
      }
    }

    for (const e of entries) {
      const matchedByRiviera = byRivieraId.get(e.id);
      if (matchedByRiviera && byLegacyId.has(e.id) === false) {
        const row = data.find((r) => String(r.id) === e.id);
        if (row?.legacy_player_id) {
          legacyKeyByEntryId.set(e.id, String(row.legacy_player_id));
        }
      }
      result[e.id] =
        byLegacyId.get(e.id) ??
        byRivieraId.get(e.id) ??
        DEFAULT_PROFILE;
    }
  }

  const needsCanonical = idsNeedingEventProfileRpc(
    result,
    entries,
    opts?.publicOnly
  );
  if (needsCanonical.length > 0) {
    const canonicalIds = legacyLookupIds(needsCanonical, legacyKeyByEntryId);
    const fromLegacyCanon = await fetchCanonicalProfilesByLegacyPlayerIds(
      organizadorId,
      canonicalIds,
      { allowAuthenticatedFallback: client === supabase }
    );
    for (const id of needsCanonical) {
      const legacyKey = legacyKeyByEntryId.get(id) ?? id;
      const profile = fromLegacyCanon.get(legacyKey);
      if (profile) {
        result[id] = mergeProfile(result[id], profile);
      }
    }

    const stillDefault = needsCanonical.filter((id) =>
      isDefaultRating(result[id]?.rating ?? DEFAULT_PROFILE.rating)
    );
    if (stillDefault.length > 0) {
      const fromRpc = await fetchPublicEventLegacyProfiles(
        organizadorId,
        legacyLookupIds(stillDefault, legacyKeyByEntryId)
      );
      for (const id of stillDefault) {
        const legacyKey = legacyKeyByEntryId.get(id) ?? id;
        const profile = fromRpc.get(legacyKey);
        if (profile) {
          result[id] = mergeProfile(result[id], profile);
        }
      }
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

  if (needsCanon.length > 0) {
    const legacyIds = Array.from(
      new Set(
        needsCanon.map((id) => legacyByRivieraId.get(id) ?? id).filter(Boolean)
      )
    );
    const fromLegacyCanon = await fetchCanonicalProfilesByLegacyPlayerIds(
      opts?.organizadorId ?? "",
      legacyIds,
      { allowAuthenticatedFallback: client === supabase }
    );
    for (const rivieraId of needsCanon) {
      const legacyId = legacyByRivieraId.get(rivieraId) ?? rivieraId;
      const profile = fromLegacyCanon.get(legacyId);
      if (profile) {
        map.set(
          rivieraId,
          mergeProfile(map.get(rivieraId) ?? { ...DEFAULT_PROFILE }, profile)
        );
      }
    }

    const stillDefault = needsCanon.filter((id) =>
      isDefaultRating(map.get(id)?.rating ?? DEFAULT_PROFILE.rating)
    );
    if (stillDefault.length > 0) {
      const fromRpc = await fetchEventAvatarsByRivieraIds(stillDefault);
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
