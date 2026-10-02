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
};

function parsePublicRating(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

type LigaPublicLookup = {
  fotos: Map<string, string>;
  ratings: Map<string, number>;
};

async function getLigaFotoReadClient(
  organizadorId: string,
  publicOnly: boolean
): Promise<typeof supabase> {
  if (publicOnly && organizadorId.trim()) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id === organizadorId.trim()) {
      return supabase;
    }
  }
  return publicOnly ? supabasePublicRead : supabase;
}

async function fetchPublicLigaJugadorFotosRpc(
  organizadorId: string,
  ligaJugadorIds: string[]
): Promise<LigaPublicLookup> {
  const fotos = new Map<string, string>();
  const ratings = new Map<string, number>();
  const ids = Array.from(new Set(ligaJugadorIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return { fotos, ratings };

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
    return { fotos, ratings };
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
    if (foto && !fotos.has(ligaId)) fotos.set(ligaId, foto);
    const rating = parsePublicRating((row as { rating?: unknown }).rating);
    if (rating != null && !ratings.has(ligaId)) ratings.set(ligaId, rating);
  }

  return { fotos, ratings };
}

async function fetchDirectLigaJugadorFotos(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  publicOnly: boolean
): Promise<LigaPublicLookup> {
  const fotos = new Map<string, string>();
  const ratings = new Map<string, number>();
  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return { fotos, ratings };

  const client = await getLigaFotoReadClient(organizadorId, publicOnly);

  const { data, error } = await client
    .from("riviera_jugadores")
    .select("id, legacy_liga_jugador_id, nombre, foto_url, rating")
    .eq("organizador_id", organizadorId)
    .in("legacy_liga_jugador_id", ids)
    .neq("estado", "archivado");

  if (error && !isMissingColumnError(error, "riviera_jugadores", "foto_url")) {
    console.warn("[publicParejaAvatars] direct legacy_liga:", error.message);
    return { fotos, ratings };
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

    const foto =
      typeof picked.foto_url === "string" && picked.foto_url.trim()
        ? picked.foto_url.trim()
        : null;
    if (foto) fotos.set(ligaId, foto);
    const rating = parsePublicRating(picked.rating);
    if (rating != null) ratings.set(ligaId, rating);
  }

  return { fotos, ratings };
}

async function fetchDirectLigaJugadorFotosByName(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  publicOnly: boolean
): Promise<LigaPublicLookup> {
  const fotos = new Map<string, string>();
  const ratings = new Map<string, number>();
  const pending = entries.filter((e) => e.id.trim() && e.name?.trim());
  if (!organizadorId.trim() || pending.length === 0) return { fotos, ratings };

  const client = await getLigaFotoReadClient(organizadorId, publicOnly);
  const { data, error } = await client
    .from("riviera_jugadores")
    .select("nombre, foto_url, rating")
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado");

  if (error) {
    console.warn("[publicParejaAvatars] direct by name:", error.message);
    return { fotos, ratings };
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
    const foto =
      typeof matches[0]!.foto_url === "string" && matches[0]!.foto_url.trim()
        ? matches[0]!.foto_url.trim()
        : null;
    if (foto) fotos.set(entry.id, foto);
    const rating = parsePublicRating(matches[0]!.rating);
    if (rating != null) ratings.set(entry.id, rating);
  }

  return { fotos, ratings };
}

/** Rating del roster del club, el mismo de la ficha (canónico, no el clon local). */
async function fetchRatingsFromClubRoster(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[]
): Promise<Map<string, number>> {
  const ratings = new Map<string, number>();
  const pending = entries.filter((e) => e.id.trim() && e.name?.trim());
  if (!organizadorId.trim() || pending.length === 0) return ratings;

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_ranking_interno_por_organizador",
    {
      p_organizador_id: organizadorId,
      p_categoria: null,
      p_genero: null,
    }
  );
  if (error || !Array.isArray(data)) return ratings;

  const byName = new Map<string, { ids: string[]; ratings: number[] }>();
  for (const row of data as Array<{
    id?: string | null;
    nombre?: string | null;
    rating?: unknown;
  }>) {
    const key = normalizePlayerNameKey(String(row.nombre ?? ""));
    const rating = parsePublicRating(row.rating);
    const id = String(row.id ?? "").trim();
    if (!key || rating == null) continue;
    const bucket = byName.get(key) ?? { ids: [], ratings: [] };
    if (id) bucket.ids.push(id);
    bucket.ratings.push(rating);
    byName.set(key, bucket);
  }

  const rivieraIds = Array.from(
    new Set(
      Array.from(byName.values()).flatMap((bucket) =>
        Array.from(new Set(bucket.ids)).length === 1 ? bucket.ids : []
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
  return ratings;
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
  lookup: LigaPublicLookup
): void {
  for (const [id, foto] of Array.from(lookup.fotos.entries())) {
    if (id in fotosOut && foto && !fotosOut[id]) fotosOut[id] = foto;
  }
  for (const [id, rating] of Array.from(lookup.ratings.entries())) {
    if (id in ratingsOut && ratingsOut[id] == null) ratingsOut[id] = rating;
  }
}

/**
 * Foto y rating de riviera_jugadores para cada liga_jugadores.id.
 * En vistas públicas el rating sale del RPC (RLS no deja leer la tabla).
 */
export async function resolveLigaJugadorPublicProfiles(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  options?: { publicOnly?: boolean }
): Promise<Record<string, LigaJugadorPublicProfile>> {
  const publicOnly = options?.publicOnly !== false;
  const fotos: Record<string, string | null> = {};
  const ratings: Record<string, number | null> = {};
  for (const e of entries) {
    fotos[e.id] = null;
    ratings[e.id] = null;
  }
  if (!organizadorId.trim() || entries.length === 0) {
    return Object.fromEntries(
      entries.map((e) => [e.id, { fotoUrl: null, rating: null }])
    );
  }

  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!ids.length) {
    return Object.fromEntries(
      entries.map((e) => [e.id, { fotoUrl: fotos[e.id] ?? null, rating: null }])
    );
  }

  if (publicOnly) {
    applyLookup(fotos, ratings, await fetchPublicLigaJugadorFotosRpc(organizadorId, ids));
  }

  const missingFoto = entries.filter((e) => !fotos[e.id]);
  if (missingFoto.length > 0) {
    applyLookup(
      fotos,
      ratings,
      await fetchDirectLigaJugadorFotos(organizadorId, missingFoto, publicOnly)
    );
  }

  const missingFotoAfterLegacy = entries.filter((e) => !fotos[e.id]);
  if (missingFotoAfterLegacy.length > 0) {
    applyLookup(
      fotos,
      ratings,
      await fetchDirectLigaJugadorFotosByName(
        organizadorId,
        missingFotoAfterLegacy,
        publicOnly
      )
    );
  }

  const stillWithoutRating = entries.filter((e) => ratings[e.id] == null);
  if (stillWithoutRating.length > 0) {
    const fromRoster = await fetchRatingsFromClubRoster(
      organizadorId,
      stillWithoutRating
    );
    for (const [id, rating] of Array.from(fromRoster.entries())) {
      if (id in ratings && ratings[id] == null) ratings[id] = rating;
    }
  }

  return Object.fromEntries(
    entries.map((e) => [
      e.id,
      { fotoUrl: fotos[e.id] ?? null, rating: ratings[e.id] ?? null },
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
