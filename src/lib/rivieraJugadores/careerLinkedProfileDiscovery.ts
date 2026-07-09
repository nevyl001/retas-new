/**
 * Descubrimiento exhaustivo de perfiles vinculados a una carrera global.
 * GUARD: lecturas públicas solo vía RPC SECURITY DEFINER — nunca tablas ROMC/RLS.
 */
import {
  listMulticlubSiblingProfilesForSource,
} from "./organizerPlayerAccess";
import {
  fetchPublicCareerJugadorIds,
  fetchPublicIdentityRows,
  linkedProfilesFromIdentityRows,
} from "./publicCareerLinkage";
import { fetchRivieraIdMapForJugadorIds, isValidRivieraId } from "./rivieraIdDisplay";
import { supabasePublicRead } from "../supabaseClient";

export type CareerLinkedProfile = {
  jugadorId: string;
  organizadorId: string;
};

async function fillOrganizadorIdsFromRivieraJugadores(
  jugadorIds: string[],
  profileMap: Map<string, string>
): Promise<void> {
  const missingOrgIds = jugadorIds.filter((id) => !profileMap.has(id));
  if (missingOrgIds.length === 0) return;

  try {
    const { data, error } = await supabasePublicRead
      .from("riviera_jugadores")
      .select("id, organizador_id")
      .in("id", missingOrgIds)
      .eq("estado", "activo");

    if (error) {
      console.warn("[career-linked-profiles] riviera_jugadores org lookup:", error);
      return;
    }

    for (const row of data ?? []) {
      const jugadorId = String((row as { id?: string }).id ?? "").trim();
      const org = String((row as { organizador_id?: string }).organizador_id ?? "").trim();
      if (jugadorId && org) profileMap.set(jugadorId, org);
    }
  } catch (e) {
    console.warn("[career-linked-profiles] riviera_jugadores org lookup:", e);
  }
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

  let rivieraId = input.rivieraId?.trim() || null;
  const identityRows =
    (await fetchPublicIdentityRows(anchor, rivieraId)) ??
    (rivieraId ? await fetchPublicIdentityRows(null, rivieraId) : null);

  if (identityRows?.length) {
    const parsed = linkedProfilesFromIdentityRows(identityRows, anchor);
    for (const id of parsed.linkedJugadorIds) idSet.add(id);
    for (const profile of parsed.linkedProfiles) {
      if (profile.organizadorId) profileMap.set(profile.jugadorId, profile.organizadorId);
    }
    if (!rivieraId && parsed.rivieraId) rivieraId = parsed.rivieraId;
  } else {
    for (const sibling of await listMulticlubSiblingProfilesForSource(anchor)) {
      idSet.add(sibling.jugadorId);
      if (sibling.organizadorId) profileMap.set(sibling.jugadorId, sibling.organizadorId);
    }
  }

  if (!rivieraId) {
    const rivieraMap = await fetchRivieraIdMapForJugadorIds(
      [anchor, ...Array.from(idSet)],
      { publicRanking: true }
    );
    rivieraId = rivieraMap.get(anchor) ?? null;
  }

  if (rivieraId && isValidRivieraId(rivieraId) && !identityRows?.length) {
    const byRiviera = await fetchPublicIdentityRows(null, rivieraId);
    if (byRiviera?.length) {
      const parsed = linkedProfilesFromIdentityRows(byRiviera, anchor);
      for (const id of parsed.linkedJugadorIds) idSet.add(id);
      for (const profile of parsed.linkedProfiles) {
        if (profile.organizadorId) profileMap.set(profile.jugadorId, profile.organizadorId);
      }
    }
  }

  await fillOrganizadorIdsFromRivieraJugadores(Array.from(idSet), profileMap);

  const linkedJugadorIds = Array.from(idSet).filter(Boolean);
  const linkedProfiles = linkedJugadorIds.map((jugadorId) => ({
    jugadorId,
    organizadorId: profileMap.get(jugadorId) ?? "",
  }));

  return { linkedJugadorIds, linkedProfiles };
}
