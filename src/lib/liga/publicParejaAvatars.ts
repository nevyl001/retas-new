import { isMissingColumnError } from "../db/schemaHelpers";
import { supabase, supabasePublicRead } from "../supabaseClient";
import type { PlayerAvatarLookupEntry } from "../rivieraJugadores/publicPlayerAvatars";
import { normalizePlayerNameKey } from "../rivieraJugadores/playerNameKey";

type RivieraLigaLinkRow = {
  id?: string;
  legacy_liga_jugador_id?: string | null;
  nombre?: string | null;
  foto_url?: unknown;
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
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(ligaJugadorIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

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
    return map;
  }

  for (const row of data ?? []) {
    const ligaId = String(
      (row as { liga_jugador_id?: string }).liga_jugador_id ?? ""
    ).trim();
    const foto =
      typeof (row as { foto_url?: unknown }).foto_url === "string" &&
      (row as { foto_url: string }).foto_url.trim()
        ? (row as { foto_url: string }).foto_url.trim()
        : null;
    if (ligaId && foto && !map.has(ligaId)) map.set(ligaId, foto);
  }

  return map;
}

async function fetchDirectLigaJugadorFotos(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  publicOnly: boolean
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  const client = await getLigaFotoReadClient(organizadorId, publicOnly);

  const { data, error } = await client
    .from("riviera_jugadores")
    .select("id, legacy_liga_jugador_id, nombre, foto_url")
    .eq("organizador_id", organizadorId)
    .in("legacy_liga_jugador_id", ids)
    .neq("estado", "archivado");

  if (error && !isMissingColumnError(error, "riviera_jugadores", "foto_url")) {
    console.warn("[publicParejaAvatars] direct legacy_liga:", error.message);
    return map;
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
    if (foto) map.set(ligaId, foto);
  }

  return map;
}

async function fetchDirectLigaJugadorFotosByName(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  publicOnly: boolean
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pending = entries.filter((e) => e.id.trim() && e.name?.trim());
  if (!organizadorId.trim() || pending.length === 0) return map;

  const client = await getLigaFotoReadClient(organizadorId, publicOnly);
  const { data, error } = await client
    .from("riviera_jugadores")
    .select("nombre, foto_url")
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado");

  if (error) {
    console.warn("[publicParejaAvatars] direct by name:", error.message);
    return map;
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
    if (foto) map.set(entry.id, foto);
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

/**
 * Fotos para jugadores de liga (liga_jugadores.id → riviera via legacy_liga_jugador_id).
 * En vistas públicas usa RPC SECURITY DEFINER (sin gate visible_publico).
 */
export async function resolveLigaJugadorPublicFotos(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  options?: { publicOnly?: boolean }
): Promise<Record<string, string | null>> {
  const publicOnly = options?.publicOnly !== false;
  const out: Record<string, string | null> = {};
  for (const e of entries) out[e.id] = null;
  if (!organizadorId.trim() || entries.length === 0) return out;

  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!ids.length) return out;

  const applyMap = (map: Map<string, string>) => {
    for (const [id, foto] of Array.from(map.entries())) {
      if (id in out && foto && !out[id]) out[id] = foto;
    }
  };

  if (publicOnly) {
    applyMap(await fetchPublicLigaJugadorFotosRpc(organizadorId, ids));
  }

  const missingAfterRpc = entries.filter((e) => !out[e.id]);
  if (missingAfterRpc.length > 0) {
    applyMap(
      await fetchDirectLigaJugadorFotos(organizadorId, missingAfterRpc, publicOnly)
    );
  }

  const missingAfterLegacy = entries.filter((e) => !out[e.id]);
  if (missingAfterLegacy.length > 0) {
    applyMap(
      await fetchDirectLigaJugadorFotosByName(
        organizadorId,
        missingAfterLegacy,
        publicOnly
      )
    );
  }

  const stillMissing = entries.filter((e) => !out[e.id]);
  if (stillMissing.length > 0 && publicOnly) {
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
