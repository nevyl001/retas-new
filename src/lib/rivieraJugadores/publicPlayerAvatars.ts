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

async function fetchEventAvatarsByLegacyIds(
  organizadorId: string,
  legacyIds: string[]
): Promise<Map<string, PlayerPublicProfile>> {
  const map = new Map<string, PlayerPublicProfile>();
  if (!organizadorId || legacyIds.length === 0) return map;

  const { data, error } = await supabase.rpc(
    "riviera_event_legacy_player_avatars",
    {
      p_organizador_id: organizadorId,
      p_legacy_player_ids: legacyIds,
    }
  );

  if (error) {
    if (!error.message?.includes("riviera_event_legacy_player_avatars")) {
      console.warn(
        "[publicPlayerAvatars] riviera_event_legacy_player_avatars:",
        error.message
      );
    }
    return map;
  }

  for (const row of data ?? []) {
    const legacyId = String((row as { legacy_player_id: string }).legacy_player_id);
    map.set(legacyId, profileFromRow(row as Record<string, unknown>));
  }
  return map;
}

function idsNeedingEventProfileRpc(
  result: Record<string, PlayerPublicProfile>,
  entries: PlayerAvatarLookupEntry[],
  publicOnly?: boolean
): string[] {
  if (publicOnly) {
    return entries.map((e) => e.id);
  }
  return entries
    .filter((e) => {
      const profile = result[e.id] ?? DEFAULT_PROFILE;
      return !profile.fotoUrl || isDefaultRating(profile.rating);
    })
    .map((e) => e.id);
}

/**
 * Resuelve foto y rating del registro Riviera por legacy_player_id, riviera id o nombre.
 * `publicOnly`: vistas /public/... — usa RPC de evento para cedidos sin visible_publico.
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

  if (!error && data) {
    const byLegacyId = new Map<string, PlayerPublicProfile>();
    const byRivieraId = new Map<string, PlayerPublicProfile>();
    const byName = new Map<string, PlayerPublicProfile>();

    for (const row of data) {
      const profile = profileFromRow(row as Record<string, unknown>);
      if (row.id) {
        byRivieraId.set(String(row.id), profile);
      }
      if (row.legacy_player_id) {
        byLegacyId.set(String(row.legacy_player_id), profile);
      }
      const key = normalizePlayerNameKey(String(row.nombre ?? ""));
      if (key) byName.set(key, profile);
    }

    for (const e of entries) {
      result[e.id] =
        byLegacyId.get(e.id) ??
        byRivieraId.get(e.id) ??
        byName.get(normalizePlayerNameKey(e.name)) ??
        DEFAULT_PROFILE;
    }
  }

  const legacyRpcIds = idsNeedingEventProfileRpc(
    result,
    entries,
    opts?.publicOnly
  );
  if (legacyRpcIds.length > 0) {
    const fromRpc = await fetchEventAvatarsByLegacyIds(
      organizadorId,
      legacyRpcIds
    );
    for (const id of legacyRpcIds) {
      const profile = fromRpc.get(id);
      if (profile) {
        result[id] = mergeProfile(result[id], profile);
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
    .select("id, foto_url, rating")
    .in("id", valid);

  if (
    error &&
    isMissingColumnError(error, "riviera_jugadores", "rating")
  ) {
    const retry = await client
      .from("riviera_jugadores")
      .select("id, foto_url")
      .in("id", valid);
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (!error && data) {
    for (const row of data) {
      map.set(String(row.id), profileFromRow(row as Record<string, unknown>));
    }
  }

  const rpcIds = opts?.publicOnly
    ? valid
    : valid.filter((id) => {
        const profile = map.get(id) ?? DEFAULT_PROFILE;
        return !profile.fotoUrl || isDefaultRating(profile.rating);
      });
  if (rpcIds.length > 0) {
    const fromRpc = await fetchEventAvatarsByRivieraIds(rpcIds);
    for (const id of rpcIds) {
      const profile = fromRpc.get(id);
      if (profile) {
        map.set(id, mergeProfile(map.get(id) ?? { ...DEFAULT_PROFILE }, profile));
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
