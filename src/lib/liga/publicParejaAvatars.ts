import { isMissingColumnError } from "../db/schemaHelpers";
import { supabase, supabasePublicRead } from "../supabaseClient";
import type { PlayerAvatarLookupEntry } from "../rivieraJugadores/publicPlayerAvatars";
import { normalizePlayerNameKey } from "../rivieraJugadores/playerNameKey";

type RivieraLigaLinkRow = {
  id?: string;
  legacy_liga_jugador_id?: string | null;
  nombre?: string | null;
  foto_url?: unknown;
  rating?: unknown;
};

export type LigaJugadorPublicProfile = {
  fotoUrl: string | null;
  /** Rating de riviera_jugadores. null = el RPC aún no lo trae. */
  rating: number | null;
  /** Identificador oficial Riviera (p. ej. RIV-00000284 / RV-000284). null si no está disponible. */
  rivieraId?: string | null;
};

const PUBLIC_RIVIERA_CODE_RE = /^(?:RIV|RV)-[0-9]{4,12}$/i;

export function isValidPublicRivieraCode(value: unknown): value is string {
  return (
    typeof value === "string" && PUBLIC_RIVIERA_CODE_RE.test(value.trim())
  );
}

function normalizePublicRivieraCode(value: unknown): string | null {
  if (!isValidPublicRivieraCode(value)) return null;
  return value.trim().toUpperCase();
}

function parsePublicRating(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

type LigaPublicLookup = {
  fotos: Map<string, string>;
  ratings: Map<string, number>;
  rivieraJugadorIds: Map<string, string>;
  rivieraIds: Map<string, string>;
};

async function getLigaFotoReadClient(
  organizadorId: string,
  publicOnly: boolean
): Promise<typeof supabase> {
  if (publicOnly && organizadorId.trim()) {
    const sessionRes = await supabase.auth.getSession();
    if (sessionRes?.data?.session?.user?.id === organizadorId.trim()) {
      return supabase;
    }
  }
  return publicOnly ? supabasePublicRead : supabase;
}

function emptyLookup(): LigaPublicLookup {
  return {
    fotos: new Map(),
    ratings: new Map(),
    rivieraJugadorIds: new Map(),
    rivieraIds: new Map(),
  };
}

async function fetchPublicLigaJugadorFotosRpc(
  organizadorId: string,
  ligaJugadorIds: string[]
): Promise<LigaPublicLookup> {
  const out = emptyLookup();
  const ids = Array.from(new Set(ligaJugadorIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return out;

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_public_liga_jugador_profiles",
    {
      p_organizador_id: organizadorId,
      p_liga_jugador_ids: ids,
    }
  );

  if (error) {
    if (
      !error.message?.includes("riviera_public_liga_jugador_profiles") &&
      !error.message?.includes("Could not find the function")
    ) {
      console.warn("[publicParejaAvatars] rpc:", error.message);
    }
    return out;
  }

  for (const row of data ?? []) {
    const ligaId = String(
      (row as { liga_jugador_id?: string }).liga_jugador_id ?? ""
    ).trim();
    if (!ligaId) continue;
    const foto =
      typeof (row as { foto_url?: unknown }).foto_url === "string" &&
      (row as { foto_url: string }).foto_url.trim()
        ? (row as { foto_url: string }).foto_url.trim()
        : null;
    if (foto && !out.fotos.has(ligaId)) out.fotos.set(ligaId, foto);
    const rating = parsePublicRating((row as { rating?: unknown }).rating);
    if (rating != null && !out.ratings.has(ligaId)) out.ratings.set(ligaId, rating);
    const rjId = String(
      (row as { riviera_jugador_id?: unknown }).riviera_jugador_id ?? ""
    ).trim();
    if (rjId && !out.rivieraJugadorIds.has(ligaId)) {
      out.rivieraJugadorIds.set(ligaId, rjId);
    }
    const code = normalizePublicRivieraCode(
      (row as { riviera_id?: unknown }).riviera_id
    );
    if (code && !out.rivieraIds.has(ligaId)) {
      out.rivieraIds.set(ligaId, code);
    }
  }

  return out;
}

async function fetchDirectLigaJugadorFotos(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  publicOnly: boolean
): Promise<LigaPublicLookup> {
  const out = emptyLookup();
  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return out;

  const client = await getLigaFotoReadClient(organizadorId, publicOnly);

  const { data, error } = await client
    .from("riviera_jugadores")
    .select("id, legacy_liga_jugador_id, nombre, foto_url, rating")
    .eq("organizador_id", organizadorId)
    .in("legacy_liga_jugador_id", ids)
    .neq("estado", "archivado");

  if (error && !isMissingColumnError(error, "riviera_jugadores", "foto_url")) {
    console.warn("[publicParejaAvatars] direct legacy_liga:", error.message);
    return out;
  }

  const byLigaId = new Map<string, RivieraLigaLinkRow[]>();
  for (const row of (data ?? []) as RivieraLigaLinkRow[]) {
    const ligaId = String(row.legacy_liga_jugador_id ?? "").trim();
    if (!ligaId || !ids.includes(ligaId)) continue;
    const list = byLigaId.get(ligaId) ?? [];
    list.push(row);
    byLigaId.set(ligaId, list);
  }

  const nameKeyByEntryId = new Map(
    entries.map((e) => [e.id, normalizePlayerNameKey(e.name ?? "")])
  );

  for (const ligaId of ids) {
    const rows = byLigaId.get(ligaId) ?? [];
    if (!rows.length) continue;

    const nameKey = nameKeyByEntryId.get(ligaId) ?? "";
    let picked = rows[0]!;
    if (nameKey && rows.length > 1) {
      const byName = rows.filter(
        (row) => normalizePlayerNameKey(String(row.nombre ?? "")) === nameKey
      );
      if (byName.length === 1) picked = byName[0]!;
    }

    const rjId = typeof picked.id === "string" ? picked.id.trim() : "";
    if (rjId) out.rivieraJugadorIds.set(ligaId, rjId);

    const foto =
      typeof picked.foto_url === "string" && picked.foto_url.trim()
        ? picked.foto_url.trim()
        : null;
    if (foto) out.fotos.set(ligaId, foto);
    const rating = parsePublicRating(picked.rating);
    if (rating != null) out.ratings.set(ligaId, rating);
  }

  return out;
}

async function fetchDirectLigaJugadorFotosByName(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  publicOnly: boolean
): Promise<LigaPublicLookup> {
  const out = emptyLookup();
  const pending = entries.filter((e) => e.id.trim() && e.name?.trim());
  if (!organizadorId.trim() || pending.length === 0) return out;

  const client = await getLigaFotoReadClient(organizadorId, publicOnly);
  const { data, error } = await client
    .from("riviera_jugadores")
    .select("id, nombre, foto_url, rating")
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado");

  if (error) {
    console.warn("[publicParejaAvatars] direct by name:", error.message);
    return out;
  }

  const rowsByName = new Map<string, RivieraLigaLinkRow[]>();
  for (const row of (data ?? []) as RivieraLigaLinkRow[]) {
    const key = normalizePlayerNameKey(String(row.nombre ?? ""));
    if (!key) continue;
    const list = rowsByName.get(key) ?? [];
    list.push(row);
    rowsByName.set(key, list);
  }

  for (const entry of pending) {
    const key = normalizePlayerNameKey(entry.name);
    if (!key) continue;
    const matches = rowsByName.get(key) ?? [];
    if (matches.length !== 1) continue;
    const rjId =
      typeof matches[0]!.id === "string" ? matches[0]!.id.trim() : "";
    if (rjId) out.rivieraJugadorIds.set(entry.id, rjId);
    const foto =
      typeof matches[0]!.foto_url === "string" && matches[0]!.foto_url.trim()
        ? matches[0]!.foto_url.trim()
        : null;
    if (foto) out.fotos.set(entry.id, foto);
    const rating = parsePublicRating(matches[0]!.rating);
    if (rating != null) out.ratings.set(entry.id, rating);
  }

  return out;
}

/** Rating e ID del roster del club, el mismo de la ficha (canónico, no el clon local). */
async function fetchRatingsFromClubRoster(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  allEntries: PlayerAvatarLookupEntry[] = entries
): Promise<{ ratings: Map<string, number>; rivieraJugadorIds: Map<string, string> }> {
  const ratings = new Map<string, number>();
  const rivieraJugadorIds = new Map<string, string>();
  const pending = entries.filter((e) => e.id.trim() && e.name?.trim());
  const identityPending = allEntries.filter((e) => e.id.trim() && e.name?.trim());
  if (!organizadorId.trim() || (pending.length === 0 && identityPending.length === 0)) {
    return { ratings, rivieraJugadorIds };
  }

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_ranking_interno_por_organizador",
    {
      p_organizador_id: organizadorId,
      p_categoria: null,
      p_genero: null,
    }
  );
  if (error || !Array.isArray(data)) return { ratings, rivieraJugadorIds };

  const byName = new Map<string, { ids: string[]; ratings: number[] }>();
  for (const row of data as Array<{
    id?: string | null;
    nombre?: string | null;
    rating?: unknown;
  }>) {
    const key = normalizePlayerNameKey(String(row.nombre ?? ""));
    const rating = parsePublicRating(row.rating);
    const id = String(row.id ?? "").trim();
    if (!key || (!id && rating == null)) continue;
    const bucket = byName.get(key) ?? { ids: [], ratings: [] };
    if (id) bucket.ids.push(id);
    if (rating != null) bucket.ratings.push(rating);
    byName.set(key, bucket);
  }

  for (const entry of identityPending) {
    const key = normalizePlayerNameKey(entry.name ?? "");
    const bucket = byName.get(key);
    if (!bucket) continue;
    const uniqueIds = Array.from(new Set(bucket.ids));
    if (uniqueIds.length === 1) {
      rivieraJugadorIds.set(entry.id, uniqueIds[0]!);
    }
  }

  if (pending.length === 0) {
    return { ratings, rivieraJugadorIds };
  }

  const rivieraIds = Array.from(
    new Set(
      Array.from(byName.values()).flatMap((bucket) =>
        Array.from(new Set(bucket.ids)).length === 1 && bucket.ratings.length > 0
          ? bucket.ids
          : []
      )
    )
  );
  const canonical = new Map<string, number>();
  if (rivieraIds.length > 0) {
    const { data: profiles, error: profileErr } = await supabasePublicRead.rpc(
      "riviera_public_riviera_jugador_profiles",
      {
        p_organizador_id: organizadorId,
        p_jugador_ids: rivieraIds,
      }
    );
    if (!profileErr && Array.isArray(profiles)) {
      for (const row of profiles as Array<{
        jugador_id?: string | null;
        rating?: unknown;
      }>) {
        const id = String(row.jugador_id ?? "").trim();
        const rating = parsePublicRating(row.rating);
        if (id && rating != null) canonical.set(id, rating);
      }
    }
  }

  for (const entry of pending) {
    const key = normalizePlayerNameKey(entry.name ?? "");
    const bucket = byName.get(key);
    if (!bucket) continue;
    const uniqueIds = Array.from(new Set(bucket.ids));
    const uniqueLocal = Array.from(new Set(bucket.ratings));
    if (uniqueIds.length === 1) {
      const fromFicha = canonical.get(uniqueIds[0]!);
      if (fromFicha != null) {
        ratings.set(entry.id, fromFicha);
        continue;
      }
    }
    if (uniqueLocal.length === 1) ratings.set(entry.id, uniqueLocal[0]!);
  }
  return { ratings, rivieraJugadorIds };
}

async function fetchPublicRivieraCodesByJugadorIds(
  organizadorId: string,
  jugadorIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniqueIds = Array.from(
    new Set(jugadorIds.map((id) => id.trim()).filter(Boolean))
  );
  if (uniqueIds.length === 0) return map;

  try {
    const { data, error } = await supabasePublicRead.rpc(
      "get_public_riviera_ids_for_jugadores",
      { p_jugador_ids: uniqueIds }
    );
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{
        jugador_id?: unknown;
        riviera_id?: unknown;
      }>) {
        const jugadorId = String(row.jugador_id ?? "").trim();
        const code = normalizePublicRivieraCode(row.riviera_id);
        if (jugadorId && code) {
          map.set(jugadorId, code);
        }
      }
    }
  } catch {
    // RPC no disponible en el entorno actual; se omite limpiamente.
  }

  const missingIds = uniqueIds.filter((id) => !map.has(id));
  if (missingIds.length > 0 && organizadorId.trim()) {
    try {
      const { data: grants, error: grantsErr } = await supabasePublicRead.rpc(
        "list_public_grants_for_ranking",
        { p_grantee_organizador_id: organizadorId }
      );
      if (!grantsErr && Array.isArray(grants) && grants.length > 0) {
        const localBySource = new Map<string, string[]>();
        for (const row of grants as Array<{
          jugador_id?: unknown;
          local_jugador_id?: unknown;
        }>) {
          const sourceId = String(row.jugador_id ?? "").trim();
          const localId = String(row.local_jugador_id ?? "").trim();
          if (!sourceId || !localId || !missingIds.includes(localId)) continue;
          const list = localBySource.get(sourceId) ?? [];
          list.push(localId);
          localBySource.set(sourceId, list);
        }
        const sourceIds = Array.from(localBySource.keys());
        if (sourceIds.length > 0) {
          const { data: sourceCodes, error: sourceErr } =
            await supabasePublicRead.rpc(
              "get_public_riviera_ids_for_jugadores",
              { p_jugador_ids: sourceIds }
            );
          if (!sourceErr && Array.isArray(sourceCodes)) {
            for (const row of sourceCodes as Array<{
              jugador_id?: unknown;
              riviera_id?: unknown;
            }>) {
              const sourceId = String(row.jugador_id ?? "").trim();
              const code = normalizePublicRivieraCode(row.riviera_id);
              if (!sourceId || !code) continue;
              for (const localId of localBySource.get(sourceId) ?? []) {
                if (!map.has(localId)) map.set(localId, code);
              }
            }
          }
        }
      }
    } catch {
      // Sin grants o RPC no disponible.
    }
  }

  return map;
}

async function fetchRivieraProfilesForLigaLinks(
  organizadorId: string,
  rivieraIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(rivieraIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_public_riviera_jugador_profiles",
    {
      p_organizador_id: organizadorId,
      p_jugador_ids: ids,
    }
  );

  if (error) {
    if (
      !error.message?.includes("riviera_public_riviera_jugador_profiles") &&
      !error.message?.includes("Could not find the function")
    ) {
      console.warn("[publicParejaAvatars] riviera rpc:", error.message);
    }
    return map;
  }

  for (const row of data ?? []) {
    const rivieraId = String(
      (row as { jugador_id?: string }).jugador_id ?? ""
    ).trim();
    const foto =
      typeof (row as { foto_url?: unknown }).foto_url === "string" &&
      (row as { foto_url: string }).foto_url.trim()
        ? (row as { foto_url: string }).foto_url.trim()
        : null;
    if (rivieraId && foto) map.set(rivieraId, foto);
  }

  return map;
}

function applyLookup(
  fotosOut: Record<string, string | null>,
  ratingsOut: Record<string, number | null>,
  rivieraJugadorIdsOut: Record<string, string | null>,
  rivieraIdsOut: Record<string, string | null>,
  lookup: LigaPublicLookup
): void {
  for (const [id, foto] of Array.from(lookup.fotos.entries())) {
    if (id in fotosOut && foto && !fotosOut[id]) fotosOut[id] = foto;
  }
  for (const [id, rating] of Array.from(lookup.ratings.entries())) {
    if (id in ratingsOut && ratingsOut[id] == null) ratingsOut[id] = rating;
  }
  for (const [id, rjId] of Array.from(lookup.rivieraJugadorIds.entries())) {
    if (id in rivieraJugadorIdsOut && rjId && !rivieraJugadorIdsOut[id]) {
      rivieraJugadorIdsOut[id] = rjId;
    }
  }
  for (const [id, code] of Array.from(lookup.rivieraIds.entries())) {
    if (id in rivieraIdsOut && code && !rivieraIdsOut[id]) {
      rivieraIdsOut[id] = code;
    }
  }
}

/**
 * Foto, rating y Riviera ID oficial de riviera_jugadores para cada liga_jugadores.id.
 * En vistas públicas el rating y el código oficial salen por RPC en lote (sin N+1 ni escrituras).
 */
export async function resolveLigaJugadorPublicProfiles(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  options?: { publicOnly?: boolean }
): Promise<Record<string, LigaJugadorPublicProfile>> {
  const publicOnly = options?.publicOnly !== false;
  const fotos: Record<string, string | null> = {};
  const ratings: Record<string, number | null> = {};
  const rivieraJugadorIds: Record<string, string | null> = {};
  const rivieraIds: Record<string, string | null> = {};
  for (const e of entries) {
    fotos[e.id] = null;
    ratings[e.id] = null;
    rivieraJugadorIds[e.id] = null;
    rivieraIds[e.id] = null;
  }
  if (!organizadorId.trim() || entries.length === 0) {
    return Object.fromEntries(
      entries.map((e) => [
        e.id,
        { fotoUrl: null, rating: null, rivieraId: null },
      ])
    );
  }

  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!ids.length) {
    return Object.fromEntries(
      entries.map((e) => [
        e.id,
        { fotoUrl: fotos[e.id] ?? null, rating: null, rivieraId: null },
      ])
    );
  }

  if (publicOnly) {
    applyLookup(
      fotos,
      ratings,
      rivieraJugadorIds,
      rivieraIds,
      await fetchPublicLigaJugadorFotosRpc(organizadorId, ids)
    );
  }

  // Fallbacks de foto en paralelo (antes eran secuenciales → latencia extra).
  const missingFoto = entries.filter((e) => !fotos[e.id]);
  const checkedDirectIds = new Set(missingFoto.map((e) => e.id));
  if (missingFoto.length > 0) {
    const [legacy, byName] = await Promise.all([
      fetchDirectLigaJugadorFotos(organizadorId, missingFoto, publicOnly),
      fetchDirectLigaJugadorFotosByName(organizadorId, missingFoto, publicOnly),
    ]);
    applyLookup(fotos, ratings, rivieraJugadorIds, rivieraIds, legacy);
    applyLookup(fotos, ratings, rivieraJugadorIds, rivieraIds, byName);
  }

  let rosterQueried = false;
  const stillWithoutRating = entries.filter((e) => ratings[e.id] == null);
  if (stillWithoutRating.length > 0) {
    rosterQueried = true;
    const fromRoster = await fetchRatingsFromClubRoster(
      organizadorId,
      stillWithoutRating,
      entries
    );
    for (const [id, rating] of Array.from(fromRoster.ratings.entries())) {
      if (id in ratings && ratings[id] == null) ratings[id] = rating;
    }
    for (const [id, rjId] of Array.from(fromRoster.rivieraJugadorIds.entries())) {
      if (id in rivieraJugadorIds && !rivieraJugadorIds[id]) {
        rivieraJugadorIds[id] = rjId;
      }
    }
  }

  const stillWithoutIdentity = entries.filter(
    (e) => !rivieraIds[e.id] && !rivieraJugadorIds[e.id]
  );
  if (stillWithoutIdentity.length > 0 && !rosterQueried) {
    rosterQueried = true;
    const fromRosterIdentity = await fetchRatingsFromClubRoster(
      organizadorId,
      [],
      stillWithoutIdentity
    );
    for (const [id, rjId] of Array.from(
      fromRosterIdentity.rivieraJugadorIds.entries()
    )) {
      if (id in rivieraJugadorIds && !rivieraJugadorIds[id]) {
        rivieraJugadorIds[id] = rjId;
      }
    }
  }

  const notYetCheckedDirect = entries.filter(
    (e) =>
      !rivieraIds[e.id] &&
      !rivieraJugadorIds[e.id] &&
      !checkedDirectIds.has(e.id)
  );
  if (notYetCheckedDirect.length > 0) {
    const legacyForIdentity = await fetchDirectLigaJugadorFotos(
      organizadorId,
      notYetCheckedDirect,
      publicOnly
    );
    applyLookup(
      fotos,
      ratings,
      rivieraJugadorIds,
      rivieraIds,
      legacyForIdentity
    );
  }

  const lookupJugadorIds = Array.from(
    new Set(
      entries
        .filter((e) => !rivieraIds[e.id] && Boolean(rivieraJugadorIds[e.id]))
        .map((e) => rivieraJugadorIds[e.id]!)
    )
  );
  if (lookupJugadorIds.length > 0) {
    const codeByJugadorId = await fetchPublicRivieraCodesByJugadorIds(
      organizadorId,
      lookupJugadorIds
    );
    for (const entry of entries) {
      if (rivieraIds[entry.id]) continue;
      const rjId = rivieraJugadorIds[entry.id];
      if (!rjId) continue;
      const code = codeByJugadorId.get(rjId) ?? null;
      if (code) rivieraIds[entry.id] = code;
    }
  }

  return Object.fromEntries(
    entries.map((e) => [
      e.id,
      {
        fotoUrl: fotos[e.id] ?? null,
        rating: ratings[e.id] ?? null,
        rivieraId: rivieraIds[e.id] ?? null,
      },
    ])
  );
}

/**
 * Fotos para jugadores de liga (liga_jugadores.id → riviera via legacy_liga_jugador_id).
 * En vistas públicas usa RPC SECURITY DEFINER (sin gate visible_publico).
 */
export async function resolveLigaJugadorPublicFotos(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  options?: { publicOnly?: boolean }
): Promise<Record<string, string | null>> {
  const profiles = await resolveLigaJugadorPublicProfiles(
    organizadorId,
    entries,
    options
  );
  const out: Record<string, string | null> = {};
  for (const e of entries) out[e.id] = profiles[e.id]?.fotoUrl ?? null;

  const publicOnly = options?.publicOnly !== false;
  const stillMissing = entries.filter((e) => !out[e.id]);
  if (!organizadorId.trim() || stillMissing.length === 0 || !publicOnly) {
    return out;
  }

  {
    const client = await getLigaFotoReadClient(organizadorId, publicOnly);
    const { data } = await client
      .from("riviera_jugadores")
      .select("id, legacy_liga_jugador_id, foto_url")
      .eq("organizador_id", organizadorId)
      .in("legacy_liga_jugador_id", stillMissing.map((e) => e.id))
      .neq("estado", "archivado");

    const rivieraIds: string[] = [];
    const rivieraByLigaId = new Map<string, string>();
    for (const row of (data ?? []) as RivieraLigaLinkRow[]) {
      const ligaId = String(row.legacy_liga_jugador_id ?? "").trim();
      const rivieraId = String(row.id ?? "").trim();
      if (!ligaId || !rivieraId) continue;
      rivieraByLigaId.set(ligaId, rivieraId);
      rivieraIds.push(rivieraId);
    }

    const fromRivieraRpc = await fetchRivieraProfilesForLigaLinks(
      organizadorId,
      rivieraIds
    );
    for (const entry of stillMissing) {
      const rivieraId = rivieraByLigaId.get(entry.id);
      if (!rivieraId) continue;
      const foto = fromRivieraRpc.get(rivieraId) ?? null;
      if (foto) out[entry.id] = foto;
    }
  }

  return out;
}
