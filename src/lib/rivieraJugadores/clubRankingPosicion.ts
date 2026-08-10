import { supabasePublicRead } from "../supabaseClient";
import { dedupeInflight } from "../async/dedupeInflight";
import type { RivieraJugadorGenero } from "./genero";

export type ClubRankingPosicionRow = {
  jugador_id: string;
  posicion: number;
  puntos: number;
};

/**
 * Gate: activar solo tras 0024 en prod + liveEquiv (compared > 0, diffs === []).
 * NO usar 404 / PGRST202 como feature detection.
 */
const CLUB_RANKING_POSICION_RPC_ENABLED = true;

/**
 * Posición 1-jugador del ranking interno del club.
 * Debe coincidir EXACTO con rankingPosicionesFromSortedForClub sobre
 * listInternalClubJugadoresRanking (carrera@host + grants + RANK por puntos).
 *
 * Sin fallback thin de jugador_stats: ese camino NO es equivalente.
 */
export async function getClubRankingPosicionForJugador(
  organizadorId: string,
  jugadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M"
): Promise<ClubRankingPosicionRow | null> {
  if (!CLUB_RANKING_POSICION_RPC_ENABLED) {
    return null;
  }

  const org = organizadorId.trim();
  const id = jugadorId.trim();
  if (!org || !id) return null;

  const generoParam = genero === "F" ? "F" : "M";
  const cat = String(categoria ?? "").trim() || "open";

  return dedupeInflight(
    `riviera_ranking_posicion_jugador_por_organizador:${org}:${id}:${cat}:${generoParam}`,
    async () => {
      const { data, error } = await supabasePublicRead.rpc(
        "riviera_ranking_posicion_jugador_por_organizador",
        {
          p_organizador_id: org,
          p_jugador_id: id,
          p_categoria: cat,
          p_genero: generoParam,
        }
      );

      if (error) {
        console.warn(
          "[clubRankingPosicion] riviera_ranking_posicion_jugador_por_organizador:",
          error
        );
        return null;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") return null;
      const posicion = Number((row as { posicion?: unknown }).posicion);
      const puntos = Number((row as { puntos?: unknown }).puntos);
      const jid = String((row as { jugador_id?: unknown }).jugador_id ?? id);
      if (!Number.isFinite(posicion) || posicion < 1) return null;
      return {
        jugador_id: jid,
        posicion,
        puntos: Number.isFinite(puntos) ? puntos : 0,
      };
    }
  );
}
