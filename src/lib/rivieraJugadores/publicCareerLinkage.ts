import { supabase, supabasePublicRead } from "../supabaseClient";
import type { JugadorParticipacion } from "./types";

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
