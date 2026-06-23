import { isMissingColumnError } from "../db/schemaHelpers";
import { supabase, supabasePublicRead } from "../supabaseClient";
import { normalizePlayerNameKey } from "./playerNameKey";

export type PlayerAvatarLookupEntry = { id: string; name: string };

export type PlayerPublicProfile = {
  fotoUrl: string | null;
  rating: number;
};

const DEFAULT_PROFILE: PlayerPublicProfile = { fotoUrl: null, rating: 3.0 };

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

/**
 * Resuelve foto y rating del registro Riviera por legacy_player_id o nombre.
 * `publicOnly`: solo jugadores visibles al público (vista /public/...).
 */
export async function resolvePlayerPublicProfiles(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  opts?: { publicOnly?: boolean }
): Promise<Record<string, PlayerPublicProfile>> {
  const result: Record<string, PlayerPublicProfile> = {};
  for (const e of entries) result[e.id] = { ...DEFAULT_PROFILE };
  if (!organizadorId || entries.length === 0) return result;

  const client = opts?.publicOnly ? supabasePublicRead : supabase;
  let q = client
    .from("riviera_jugadores")
    .select("legacy_player_id, nombre, foto_url, rating")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo");

  if (opts?.publicOnly) {
    q = q.eq("visible_publico", true);
  }

  let { data, error } = await q;
  if (
    error &&
    isMissingColumnError(error, "riviera_jugadores", "rating")
  ) {
    let qBase = client
      .from("riviera_jugadores")
      .select("legacy_player_id, nombre, foto_url")
      .eq("organizador_id", organizadorId)
      .eq("estado", "activo");
    if (opts?.publicOnly) {
      qBase = qBase.eq("visible_publico", true);
    }
    const retry = await qBase;
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error || !data) return result;

  const byLegacyId = new Map<string, PlayerPublicProfile>();
  const byName = new Map<string, PlayerPublicProfile>();

  for (const row of data) {
    const profile = profileFromRow(row as Record<string, unknown>);
    if (row.legacy_player_id) {
      byLegacyId.set(String(row.legacy_player_id), profile);
    }
    const key = normalizePlayerNameKey(String(row.nombre ?? ""));
    if (key) byName.set(key, profile);
  }

  for (const e of entries) {
    result[e.id] =
      byLegacyId.get(e.id) ??
      byName.get(normalizePlayerNameKey(e.name)) ??
      DEFAULT_PROFILE;
  }

  return result;
}

/** Perfiles por id de riviera_jugadores (duelos 2v2, etc.). */
export async function fetchRivieraJugadorProfilesByIds(
  ids: (string | null)[],
  opts?: { publicOnly?: boolean }
): Promise<Map<string, PlayerPublicProfile>> {
  const valid = Array.from(
    new Set(ids.filter((id): id is string => Boolean(id)))
  );
  const map = new Map<string, PlayerPublicProfile>();
  for (const id of valid) map.set(id, { ...DEFAULT_PROFILE });
  if (valid.length === 0) return map;

  const client = opts?.publicOnly ? supabasePublicRead : supabase;
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

  if (error || !data) return map;

  for (const row of data) {
    map.set(String(row.id), profileFromRow(row as Record<string, unknown>));
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
