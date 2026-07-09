import { supabase, supabasePublicRead } from "../supabaseClient";
import type { JugadorParticipacion } from "./types";

export type PublicIdentityRpcRow = {
  anchor_jugador_id?: string;
  canonical_jugador_id?: string;
  riviera_id?: string | null;
  official_player_key?: string | null;
  home_organizador_id?: string | null;
  linked_jugador_id?: string;
  linked_organizador_id?: string | null;
};

function isMissingIdentityRpcError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("resolve_public_player_identity")
  );
}

function isMissingCareerRpcError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("get_public_career_jugador_ids") ||
    msg.includes("riviera_list_career_participaciones_public") ||
    msg.includes("riviera_list_participaciones_for_jugador_ids")
  );
}

/** Identidad global pública vía SECURITY DEFINER (sin SELECT directo a tablas ROMC). */
export async function fetchPublicIdentityRows(
  jugadorId?: string | null,
  rivieraId?: string | null
): Promise<PublicIdentityRpcRow[] | null> {
  const params: Record<string, string | null> = {
    p_jugador_id: jugadorId?.trim() || null,
    p_riviera_id: rivieraId?.trim() || null,
  };
  if (!params.p_jugador_id && !params.p_riviera_id) return null;

  try {
    const { data, error } = await supabasePublicRead.rpc(
      "resolve_public_player_identity",
      params
    );
    if (error) {
      if (isMissingIdentityRpcError(error)) return null;
      console.warn("[riviera-jugadores] fetchPublicIdentityRows:", error);
      return null;
    }
    return (data ?? []) as PublicIdentityRpcRow[];
  } catch (e) {
    console.warn("[riviera-jugadores] fetchPublicIdentityRows:", e);
    return null;
  }
}

export function linkedProfilesFromIdentityRows(
  rows: PublicIdentityRpcRow[],
  anchorJugadorId: string
): {
  linkedJugadorIds: string[];
  linkedProfiles: Array<{ jugadorId: string; organizadorId: string }>;
  rivieraId: string | null;
  officialPlayerKey: string | null;
  canonicalJugadorId: string;
  homeOrganizadorId: string | null;
} {
  const anchor = anchorJugadorId.trim();
  const ids = new Set<string>([anchor]);
  const profileMap = new Map<string, string>();
  let rivieraId: string | null = null;
  let officialPlayerKey: string | null = null;
  let canonicalJugadorId = anchor;
  let homeOrganizadorId: string | null = null;

  for (const row of rows) {
    const linked = row.linked_jugador_id?.trim();
    const org = row.linked_organizador_id?.trim();
    if (linked) {
      ids.add(linked);
      if (org) profileMap.set(linked, org);
    }
    if (!rivieraId && row.riviera_id) rivieraId = String(row.riviera_id);
    if (!officialPlayerKey && row.official_player_key) {
      officialPlayerKey = String(row.official_player_key);
    }
    if (row.canonical_jugador_id) {
      canonicalJugadorId = String(row.canonical_jugador_id).trim();
    }
    if (!homeOrganizadorId && row.home_organizador_id) {
      homeOrganizadorId = String(row.home_organizador_id).trim();
    }
  }

  return {
    linkedJugadorIds: Array.from(ids).filter(Boolean),
    linkedProfiles: Array.from(ids).map((jugadorId) => ({
      jugadorId,
      organizadorId: profileMap.get(jugadorId) ?? "",
    })),
    rivieraId,
    officialPlayerKey,
    canonicalJugadorId,
    homeOrganizadorId,
  };
}

/** Perfiles de la misma Carrera accesibles en lectura pública (null = RPC no desplegado). */
export async function fetchPublicCareerJugadorIds(
  jugadorId: string
): Promise<string[] | null> {
  const id = jugadorId.trim();
  if (!id) return [];

  const { data, error } = await supabasePublicRead.rpc(
    "get_public_career_jugador_ids",
    { p_jugador_id: id }
  );

  if (error) {
    if (isMissingCareerRpcError(error)) return null;
    console.warn("[riviera-jugadores] fetchPublicCareerJugadorIds:", error);
    return null;
  }

  return Array.from(
    new Set(
      (data ?? [])
        .map((row: string | { jugador_id?: string }) => {
          if (typeof row === "string") return row.trim();
          if (row && typeof row === "object" && "jugador_id" in row) {
            return String(row.jugador_id ?? "").trim();
          }
          return "";
        })
        .filter(Boolean)
    )
  );
}

/** Historial global de carrera para ficha pública (null = RPC no desplegado). */
export async function listCareerParticipacionesPublic(
  jugadorId: string,
  limit = 100
): Promise<JugadorParticipacion[] | null> {
  const id = jugadorId.trim();
  if (!id) return [];

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_list_career_participaciones_public",
    {
      p_jugador_id: id,
      p_limit: limit,
    }
  );

  if (error) {
    if (isMissingCareerRpcError(error)) return null;
    console.warn("[riviera-jugadores] listCareerParticipacionesPublic:", error);
    return null;
  }

  return (data ?? []) as JugadorParticipacion[];
}

/**
 * Participaciones globales por lista explícita de jugador_id (SECURITY DEFINER).
 * Fuente canónica del motor de carrera cuando la identidad ya resolvió todos los perfiles.
 */
export async function listParticipacionesForJugadorIds(
  jugadorIds: string[],
  limit = 500
): Promise<JugadorParticipacion[] | null> {
  const ids = Array.from(new Set(jugadorIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return [];

  for (const client of [supabasePublicRead, supabase]) {
    const { data, error } = await client.rpc(
      "riviera_list_participaciones_for_jugador_ids",
      {
        p_jugador_ids: ids,
        p_limit: limit,
      }
    );

    if (error) {
      if (isMissingCareerRpcError(error)) continue;
      console.warn("[riviera-jugadores] listParticipacionesForJugadorIds:", error);
      continue;
    }

    return (data ?? []) as JugadorParticipacion[];
  }

  return null;
}
