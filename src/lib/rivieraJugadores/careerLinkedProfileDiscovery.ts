/**
 * Descubrimiento exhaustivo de perfiles vinculados a una carrera global.
 * GUARD: nunca depender de un solo RPC; siempre unir profile_link + grants + career RPC.
 */
import {
  listGrantedLocalJugadorIdsForSource,
  listMulticlubSiblingProfilesForSource,
} from "./organizerPlayerAccess";
import { fetchPublicCareerJugadorIds } from "./publicCareerLinkage";
import { fetchRivieraIdMapForJugadorIds, isValidRivieraId } from "./rivieraIdDisplay";
import { supabase, supabasePublicRead } from "../supabaseClient";

export type CareerLinkedProfile = {
  jugadorId: string;
  organizadorId: string;
};

/** Todos los riviera_jugador_id con el mismo official_player_key (profile_link). */
async function fetchJugadorIdsByOfficialPlayerKey(
  officialPlayerKey: string
): Promise<CareerLinkedProfile[]> {
  const key = officialPlayerKey.trim();
  if (!key) return [];

  const profiles: CareerLinkedProfile[] = [];
  for (const client of [supabasePublicRead, supabase]) {
    const { data: links, error: linkErr } = await client
      .from("riviera_official_player_profile_link")
      .select("riviera_jugador_id")
      .eq("official_player_key", key);

    if (linkErr || !links?.length) continue;

    const ids = links
      .map((row) =>
        String((row as { riviera_jugador_id?: string }).riviera_jugador_id ?? "").trim()
      )
      .filter(Boolean);
    if (ids.length === 0) continue;

    const { data: jugadores, error: jugErr } = await client
      .from("riviera_jugadores")
      .select("id, organizador_id")
      .in("id", ids)
      .eq("estado", "activo");

    if (jugErr) continue;
    for (const row of jugadores ?? []) {
      const jugadorId = String((row as { id?: string }).id ?? "").trim();
      const organizadorId = String(
        (row as { organizador_id?: string }).organizador_id ?? ""
      ).trim();
      if (jugadorId) profiles.push({ jugadorId, organizadorId });
    }
    if (profiles.length > 0) break;
  }
  return profiles;
}

/** Perfiles enlazados por Riviera ID textual (misma identidad oficial). */
async function fetchJugadorIdsByRivieraId(
  rivieraId: string
): Promise<CareerLinkedProfile[]> {
  if (!isValidRivieraId(rivieraId)) return [];

  const profiles: CareerLinkedProfile[] = [];
  for (const client of [supabasePublicRead, supabase]) {
    const { data: identity, error: idErr } = await client
      .from("riviera_official_player_identity")
      .select("official_player_key, canonical_riviera_jugador_id")
      .eq("riviera_id", rivieraId.trim())
      .maybeSingle();

    if (idErr || !identity) continue;

    const officialKey = String(
      (identity as { official_player_key?: string }).official_player_key ?? ""
    ).trim();
    const canonical = String(
      (identity as { canonical_riviera_jugador_id?: string }).canonical_riviera_jugador_id ??
        ""
    ).trim();

    if (officialKey) {
      const byKey = await fetchJugadorIdsByOfficialPlayerKey(officialKey);
      profiles.push(...byKey);
    }
    if (canonical) {
      const { data: canonicalRow } = await client
        .from("riviera_jugadores")
        .select("id, organizador_id")
        .eq("id", canonical)
        .eq("estado", "activo")
        .maybeSingle();
      if (canonicalRow) {
        profiles.push({
          jugadorId: String((canonicalRow as { id?: string }).id ?? ""),
          organizadorId: String(
            (canonicalRow as { organizador_id?: string }).organizador_id ?? ""
          ),
        });
      }
    }
    if (profiles.length > 0) break;
  }
  return profiles;
}

/** Grants activos en ambas direcciones (source→local y local→source). */
async function fetchGrantLinkedJugadorIds(anchorJugadorId: string): Promise<string[]> {
  const anchor = anchorJugadorId.trim();
  if (!anchor) return [];

  const ids = new Set<string>();
  for (const localId of await listGrantedLocalJugadorIdsForSource(anchor)) {
    ids.add(localId);
  }

  for (const client of [supabase, supabasePublicRead]) {
    const { data: asLocal, error: localErr } = await client
      .from("organizer_player_access")
      .select("jugador_id")
      .eq("local_jugador_id", anchor)
      .eq("is_active", true)
      .not("jugador_id", "is", null);

    if (!localErr) {
      for (const row of asLocal ?? []) {
        const id = String((row as { jugador_id?: string }).jugador_id ?? "").trim();
        if (id) ids.add(id);
      }
    }

    const { data: asSource, error: sourceErr } = await client
      .from("organizer_player_access")
      .select("local_jugador_id")
      .eq("jugador_id", anchor)
      .eq("is_active", true)
      .not("local_jugador_id", "is", null);

    if (!sourceErr) {
      for (const row of asSource ?? []) {
        const id = String(
          (row as { local_jugador_id?: string }).local_jugador_id ?? ""
        ).trim();
        if (id) ids.add(id);
      }
    }
  }

  return Array.from(ids);
}

export type DiscoverCareerLinkedProfilesInput = {
  anchorJugadorId: string;
  rivieraId?: string | null;
  officialPlayerKey?: string | null;
  /** IDs ya conocidos del RPC de identidad (se fusionan, no reemplazan). */
  seedJugadorIds?: string[];
};

/**
 * Unión exhaustiva de perfiles para carrera global.
 * Usar siempre después de identity RPC — nunca confiar en un solo origen.
 */
export async function discoverCareerLinkedProfiles(
  input: DiscoverCareerLinkedProfilesInput
): Promise<{
  linkedJugadorIds: string[];
  linkedProfiles: CareerLinkedProfile[];
}> {
  const anchor = input.anchorJugadorId.trim();
  const idSet = new Set<string>([anchor, ...(input.seedJugadorIds ?? [])]);
  const profileMap = new Map<string, string>();

  const careerIds = await fetchPublicCareerJugadorIds(anchor);
  if (careerIds) {
    for (const id of careerIds) idSet.add(id);
  }

  for (const sibling of await listMulticlubSiblingProfilesForSource(anchor)) {
    idSet.add(sibling.jugadorId);
    if (sibling.organizadorId) profileMap.set(sibling.jugadorId, sibling.organizadorId);
  }

  for (const grantId of await fetchGrantLinkedJugadorIds(anchor)) {
    idSet.add(grantId);
  }

  let rivieraId = input.rivieraId?.trim() || null;
  if (!rivieraId) {
    const rivieraMap = await fetchRivieraIdMapForJugadorIds([anchor, ...Array.from(idSet)], {
      publicRanking: true,
    });
    rivieraId = rivieraMap.get(anchor) ?? null;
  }

  if (rivieraId) {
    for (const profile of await fetchJugadorIdsByRivieraId(rivieraId)) {
      idSet.add(profile.jugadorId);
      if (profile.organizadorId) profileMap.set(profile.jugadorId, profile.organizadorId);
    }
  }

  const officialKey = input.officialPlayerKey?.trim() || null;
  if (officialKey) {
    for (const profile of await fetchJugadorIdsByOfficialPlayerKey(officialKey)) {
      idSet.add(profile.jugadorId);
      if (profile.organizadorId) profileMap.set(profile.jugadorId, profile.organizadorId);
    }
  }

  const missingOrgIds = Array.from(idSet).filter((id) => !profileMap.has(id));
  if (missingOrgIds.length > 0) {
    for (const client of [supabasePublicRead, supabase]) {
      const { data, error } = await client
        .from("riviera_jugadores")
        .select("id, organizador_id")
        .in("id", missingOrgIds)
        .eq("estado", "activo");

      if (error) continue;
      for (const row of data ?? []) {
        const jugadorId = String((row as { id?: string }).id ?? "").trim();
        const org = String((row as { organizador_id?: string }).organizador_id ?? "").trim();
        if (jugadorId && org) profileMap.set(jugadorId, org);
      }
      break;
    }
  }

  const linkedJugadorIds = Array.from(idSet).filter(Boolean);
  const linkedProfiles = linkedJugadorIds.map((jugadorId) => ({
    jugadorId,
    organizadorId: profileMap.get(jugadorId) ?? "",
  }));

  return { linkedJugadorIds, linkedProfiles };
}
