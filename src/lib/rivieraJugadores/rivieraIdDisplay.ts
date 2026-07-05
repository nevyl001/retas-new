import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, supabasePublicRead } from "../supabaseClient";
import type { RivieraJugadorWithStats } from "./types";

export const RIVIERA_ID_EXACT = /^RIV-[0-9]{8}$/;

export function isValidRivieraId(value: unknown): value is string {
  return typeof value === "string" && RIVIERA_ID_EXACT.test(value);
}

export function collectJugadorIdsForRivieraLookup(
  jugadores: Pick<RivieraJugadorWithStats, "id" | "grantedAccess">[]
): string[] {
  const ids = new Set<string>();
  for (const j of jugadores) {
    if (j.id) ids.add(j.id);
    const sourceId = j.grantedAccess?.sourceJugadorId;
    if (sourceId) ids.add(sourceId);
  }
  return Array.from(ids);
}

function mergeRivieraIdMaps(
  ...maps: Map<string, string>[]
): Map<string, string> {
  const merged = new Map<string, string>();
  for (const map of maps) {
    map.forEach((value, key) => {
      if (isValidRivieraId(value)) merged.set(key, value);
    });
  }
  return merged;
}

function mapCanonicalIdentityRows(
  rows: { canonical_riviera_jugador_id?: unknown; riviera_id?: unknown }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const jugadorId = String(row.canonical_riviera_jugador_id ?? "");
    if (jugadorId && isValidRivieraId(row.riviera_id)) {
      map.set(jugadorId, row.riviera_id);
    }
  }
  return map;
}

function mapProfileLinkRows(
  rows: {
    riviera_jugador_id?: unknown;
    riviera_official_player_identity?:
      | { riviera_id?: string | null }
      | { riviera_id?: string | null }[]
      | null;
  }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const jugadorId = String(row.riviera_jugador_id ?? "");
    const identity = row.riviera_official_player_identity;
    const rivieraId = Array.isArray(identity)
      ? identity[0]?.riviera_id
      : identity?.riviera_id;
    if (jugadorId && isValidRivieraId(rivieraId)) {
      map.set(jugadorId, rivieraId);
    }
  }
  return map;
}

async function fetchRivieraIdsByCanonicalJugadorIds(
  ids: string[],
  clients: SupabaseClient[] = [supabase, supabasePublicRead]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const results = await Promise.all(
    clients.map((client) =>
      client
        .from("riviera_official_player_identity")
        .select("canonical_riviera_jugador_id, riviera_id")
        .in("canonical_riviera_jugador_id", ids)
        .not("riviera_id", "is", null)
    )
  );

  return mergeRivieraIdMaps(
    ...results
      .filter((result) => !result.error && result.data)
      .map((result) => mapCanonicalIdentityRows(result.data ?? []))
  );
}

async function fetchRivieraIdsByProfileLinks(
  ids: string[],
  clients: SupabaseClient[] = [supabase, supabasePublicRead]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const results = await Promise.all(
    clients.map((client) =>
      client
        .from("riviera_official_player_profile_link")
        .select(
          "riviera_jugador_id, riviera_official_player_identity(riviera_id)"
        )
        .in("riviera_jugador_id", ids)
    )
  );

  return mergeRivieraIdMaps(
    ...results
      .filter((result) => !result.error && result.data)
      .map((result) => mapProfileLinkRows(result.data ?? []))
  );
}

/** RPC existente (SECURITY DEFINER): asigna/lee identidad cuando el organizador autenticado es dueño. */
async function fetchRivieraIdsViaEnsure(ids: string[]): Promise<Map<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session || ids.length === 0) return new Map();

  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  const { ensureRivieraIdentity } = await import("./careerIdentity");

  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const result = await ensureRivieraIdentity(id);
        if (isValidRivieraId(result?.rivieraId)) {
          map.set(id, result!.rivieraId!);
        }
      } catch {
        // Sin permiso, RPC no desplegado, etc.
      }
    })
  );

  return map;
}

/** RPC 2.1.3B — lectura pública para perfiles visible_publico (anon ok). */
async function fetchPublicRivieraIdsViaRpc(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const map = new Map<string, string>();
  const clients = [supabasePublicRead, supabase];

  await Promise.all(
    ids.map(async (id) => {
      for (const client of clients) {
        try {
          const { data, error } = await client.rpc(
            "get_public_riviera_id_for_jugador",
            { p_jugador_id: id }
          );
          if (error) continue;
          if (isValidRivieraId(data)) {
            map.set(id, data);
            break;
          }
        } catch {
          // RPC no desplegado aún
        }
      }
    })
  );

  return map;
}

async function fetchRivieraIdsFromOrganizerMemberships(): Promise<
  Map<string, string>
> {
  try {
    const { listOrganizerMemberships } = await import("./playerMembership");
    const rows = await listOrganizerMemberships();
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!isValidRivieraId(row.rivieraId)) continue;
      map.set(row.sourceJugadorId, row.rivieraId);
      if (row.localJugadorId) map.set(row.localJugadorId, row.rivieraId);
    }
    return map;
  } catch {
    return new Map();
  }
}


/** Mapa jugador_id → riviera_id usando consultas/RPC existentes. */
export async function fetchRivieraIdMapForJugadorIds(
  ids: string[],
  opts?: { allowEnsure?: boolean; ensureLimit?: number }
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const [byCanonical, byProfileLink, byMembership, byPublicRpc] =
    await Promise.all([
      fetchRivieraIdsByCanonicalJugadorIds(uniqueIds),
      fetchRivieraIdsByProfileLinks(uniqueIds),
      fetchRivieraIdsFromOrganizerMemberships(),
      fetchPublicRivieraIdsViaRpc(uniqueIds),
    ]);

  let merged = mergeRivieraIdMaps(
    byCanonical,
    byProfileLink,
    byMembership,
    byPublicRpc
  );

  if (opts?.allowEnsure !== false) {
    const missing = uniqueIds.filter((id) => !merged.has(id));
    const limit = opts?.ensureLimit ?? missing.length;
    if (missing.length > 0 && limit > 0) {
      const viaEnsure = await fetchRivieraIdsViaEnsure(missing.slice(0, limit));
      merged = mergeRivieraIdMaps(merged, viaEnsure);
    }
  }

  return merged;
}

export function applyRivieraIdToJugador<T extends RivieraJugadorWithStats>(
  jugador: T,
  idMap: Map<string, string>
): T {
  const rivieraId =
    idMap.get(jugador.id) ??
    (jugador.grantedAccess?.sourceJugadorId
      ? idMap.get(jugador.grantedAccess.sourceJugadorId)
      : undefined);

  if (!isValidRivieraId(rivieraId)) return jugador;
  return { ...jugador, riviera_id: rivieraId };
}

export async function enrichJugadoresWithRivieraId<
  T extends RivieraJugadorWithStats,
>(jugadores: T[]): Promise<T[]> {
  if (jugadores.length === 0) return jugadores;

  const idMap = await fetchRivieraIdMapForJugadorIds(
    collectJugadorIdsForRivieraLookup(jugadores),
    { ensureLimit: 25 }
  );
  if (idMap.size === 0) return jugadores;

  return jugadores.map((jugador) => applyRivieraIdToJugador(jugador, idMap));
}

export async function enrichJugadorWithRivieraId<
  T extends RivieraJugadorWithStats,
>(jugador: T): Promise<T> {
  const lookupIds = collectJugadorIdsForRivieraLookup([jugador]);
  const idMap = await fetchRivieraIdMapForJugadorIds(lookupIds, {
    ensureLimit: lookupIds.length,
  });
  return applyRivieraIdToJugador(jugador, idMap);
}
