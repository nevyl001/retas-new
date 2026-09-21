import { computeJornadaPublicStats } from "./jornadaStats";
import type { LigaJornada } from "./types";

/**
 * Stats de apoyo derivadas en cliente (no oficiales).
 * Los puntos oficiales siguen viniendo de `liga_inscripciones` vía `getRanking`.
 */
export interface JugadorSeasonSupportStats {
  victorias: number;
  derrotas: number;
  empates: number;
  games_favor: number;
  games_contra: number;
  diferencia_games: number;
}

function emptyStats(): JugadorSeasonSupportStats {
  return {
    victorias: 0,
    derrotas: 0,
    empates: 0,
    games_favor: 0,
    games_contra: 0,
    diferencia_games: 0,
  };
}

/**
 * Agrega V/D/empates/games por jugador desde pareja-stats de jornadas
 * `completed` (parejas rotativas: cada jugador hereda el resultado de la
 * pareja en la que jugó esa jornada).
 *
 * Nunca lanza: si una jornada falla o queda incompleta, se omite.
 */
export function aggregateJugadorSeasonSupportStats(
  jornadas: LigaJornada[] | null | undefined
): Map<string, JugadorSeasonSupportStats> {
  const byJugador = new Map<string, JugadorSeasonSupportStats>();

  if (!jornadas?.length) return byJugador;

  for (const jornada of jornadas) {
    if (jornada.estado !== "completed") continue;

    try {
      const { rankingParejas } = computeJornadaPublicStats(jornada);
      if (!rankingParejas.length) continue;

      const parejaById = new Map(
        (jornada.parejas ?? []).map((p) => [p.id, p] as const)
      );

      for (const pair of rankingParejas) {
        const pareja = parejaById.get(pair.parejaId);
        if (!pareja) continue;

        for (const rawId of [pareja.jugador1_id, pareja.jugador2_id]) {
          if (rawId == null || rawId === "") continue;
          const jugadorId = String(rawId);
          const st = byJugador.get(jugadorId) ?? emptyStats();
          st.victorias += Number(pair.victorias) || 0;
          st.derrotas += Number(pair.derrotas) || 0;
          st.empates += Number(pair.empates) || 0;
          st.games_favor += Number(pair.games_favor) || 0;
          st.games_contra += Number(pair.games_contra) || 0;
          byJugador.set(jugadorId, st);
        }
      }
    } catch {
      // Jornada incompleta o cálculo fallido: no rompe el ranking oficial.
    }
  }

  for (const st of Array.from(byJugador.values())) {
    st.diferencia_games = st.games_favor - st.games_contra;
  }

  return byJugador;
}

/** True si hay al menos un partido decidido o games registrados. */
export function hasMeaningfulSupportStats(
  st: JugadorSeasonSupportStats | undefined | null
): st is JugadorSeasonSupportStats {
  if (!st) return false;
  return (
    st.victorias + st.derrotas + st.empates > 0 ||
    st.games_favor + st.games_contra > 0
  );
}

export function formatSupportDif(dif: number): string {
  if (!Number.isFinite(dif)) return "—";
  if (dif > 0) return `+${dif}`;
  return String(dif);
}
