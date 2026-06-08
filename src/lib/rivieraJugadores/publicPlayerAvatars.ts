import { supabase, supabasePublicRead } from "../supabaseClient";
import { normalizePlayerNameKey } from "./playerNameKey";

export type PlayerAvatarLookupEntry = { id: string; name: string };

/**
 * Resuelve foto_url del registro Riviera por legacy_player_id o nombre.
 * `publicOnly`: solo jugadores visibles al público (vista /public/...).
 */
export async function resolvePlayerAvatars(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  opts?: { publicOnly?: boolean }
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const e of entries) result[e.id] = null;
  if (!organizadorId || entries.length === 0) return result;

  const client = opts?.publicOnly ? supabasePublicRead : supabase;
  let q = client
    .from("riviera_jugadores")
    .select("legacy_player_id, nombre, foto_url")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo");

  if (opts?.publicOnly) {
    q = q.eq("visible_publico", true);
  }

  const { data, error } = await q;
  if (error || !data) return result;

  const byLegacyId = new Map<string, string | null>();
  const byName = new Map<string, string | null>();

  for (const row of data) {
    const foto =
      typeof row.foto_url === "string" && row.foto_url.trim()
        ? row.foto_url.trim()
        : null;
    if (row.legacy_player_id) {
      byLegacyId.set(String(row.legacy_player_id), foto);
    }
    const key = normalizePlayerNameKey(String(row.nombre ?? ""));
    if (key && foto) byName.set(key, foto);
  }

  for (const e of entries) {
    result[e.id] =
      byLegacyId.get(e.id) ??
      byName.get(normalizePlayerNameKey(e.name)) ??
      null;
  }

  return result;
}
