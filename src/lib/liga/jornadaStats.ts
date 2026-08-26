import {
  parejasFijasVictoryRankingPoints,
  resolveParejasFijasPartidoTotals,
} from "./parejasFijasMatchScore";
import {
  computePlayoffsMatchPoints,
  derivePlayoffsGamesTotals,
  parsePlayoffsSetScoresJson,
} from "./parejasFijasPlayoffsMatchScore";
import type { LigaJornada, LigaJornadaPareja } from "./types";

export interface ParejaJornadaStat {
  parejaId: string;
  nombre: string;
  puntos: number;
  victorias: number;
  empates: number;
  derrotas: number;
  games_favor: number;
}

export interface JugadorJornadaStat {
  jugadorId: string;
  nombre: string;
  puntos: number;
}

export interface JornadaPublicStats {
  rankingJugadores: Array<JugadorJornadaStat & { posicion: number }>;
  rankingParejas: Array<ParejaJornadaStat & { posicion: number }>;
  ganadorPareja: ParejaJornadaStat | null;
}

function parejaDisplayName(p: LigaJornadaPareja): string {
  return `${p.jugador1?.nombre ?? "?"} / ${p.jugador2?.nombre ?? "?"}`;
}

export interface JornadaPublicStatsOptions {
  parejasFijas?: boolean;
}

/** Puntos de jornada por jugador y pareja (rotativo: games; parejas fijas: 3/2/0). */
export function computeJornadaPublicStats(
  jornada: LigaJornada | undefined,
  options?: JornadaPublicStatsOptions
): JornadaPublicStats {
  const parejasFijas = options?.parejasFijas === true;
  const parejas = jornada?.parejas ?? [];
  const partidos = (jornada?.partidos ?? []).filter(
    (p) => p.estado === "completed"
  );

  const parejaMap = new Map<string, LigaJornadaPareja>();
  for (const p of parejas) {
    parejaMap.set(p.id, p);
  }

  const statsPareja = new Map<
    string,
    {
      puntos: number;
      victorias: number;
      empates: number;
      derrotas: number;
      games_favor: number;
    }
  >();
  for (const p of parejas) {
    statsPareja.set(p.id, {
      puntos: 0,
      victorias: 0,
      empates: 0,
      derrotas: 0,
      games_favor: 0,
    });
  }

  const puntosJugador = new Map<string, number>();
  const nombreJugador = new Map<string, string>();

  for (const p of parejas) {
    if (p.jugador1) {
      nombreJugador.set(p.jugador1_id, p.jugador1.nombre);
      puntosJugador.set(p.jugador1_id, 0);
    }
    if (p.jugador2) {
      nombreJugador.set(p.jugador2_id, p.jugador2.nombre);
      puntosJugador.set(p.jugador2_id, 0);
    }
  }

  for (const m of partidos) {
    const id1 = m.pareja1_id;
    const id2 = m.pareja2_id;

    if (parejasFijas) {
      const playoffsPayload = parsePlayoffsSetScoresJson(m.set_scores);
      if (
        playoffsPayload &&
        m.score_pareja1 != null &&
        m.score_pareja2 != null
      ) {
        const derived = derivePlayoffsGamesTotals(
          playoffsPayload,
          Number(m.score_pareja1),
          Number(m.score_pareja2)
        );
        if ("error" in derived) continue;
        const computed = computePlayoffsMatchPoints(
          derived.gamesTotalP1,
          derived.gamesTotalP2,
          playoffsPayload
        );
        if (!computed.ok) continue;
        const st1 = statsPareja.get(id1);
        const st2 = statsPareja.get(id2);
        if (st1) {
          st1.puntos += computed.result.pointsP1;
          st1.games_favor += derived.gamesTotalP1;
          if (computed.result.p1Won) st1.victorias += 1;
          else st1.derrotas += 1;
        }
        if (st2) {
          st2.puntos += computed.result.pointsP2;
          st2.games_favor += derived.gamesTotalP2;
          if (!computed.result.p1Won) st2.victorias += 1;
          else st2.derrotas += 1;
        }
        continue;
      }

      const totals = resolveParejasFijasPartidoTotals({
        score_pareja1: m.score_pareja1,
        score_pareja2: m.score_pareja2,
        set_scores:
          m.set_scores &&
          typeof m.set_scores === "object" &&
          "sets" in m.set_scores
            ? (m.set_scores as import("./parejasFijasMatchScore").LigaPartidoSetScores)
            : null,
      });
      if (!totals) continue;

      const pts1 = parejasFijasVictoryRankingPoints(totals, true);
      const pts2 = parejasFijasVictoryRankingPoints(totals, false);

      const st1 = statsPareja.get(id1);
      const st2 = statsPareja.get(id2);
      if (st1) {
        st1.puntos += pts1;
        st1.games_favor += totals.gamesP1;
        if (totals.p1WonMatch) st1.victorias += 1;
        else st1.derrotas += 1;
      }
      if (st2) {
        st2.puntos += pts2;
        st2.games_favor += totals.gamesP2;
        if (!totals.p1WonMatch) st2.victorias += 1;
        else st2.derrotas += 1;
      }
      continue;
    }

    const s1 = Number(m.score_pareja1 ?? 0);
    const s2 = Number(m.score_pareja2 ?? 0);

    const st1 = statsPareja.get(id1);
    const st2 = statsPareja.get(id2);
    if (st1) {
      st1.puntos += s1;
      st1.games_favor += s1;
      if (s1 > s2) st1.victorias += 1;
      else if (s1 === s2) st1.empates += 1;
      else st1.derrotas += 1;
    }
    if (st2) {
      st2.puntos += s2;
      st2.games_favor += s2;
      if (s2 > s1) st2.victorias += 1;
      else if (s2 === s1) st2.empates += 1;
      else st2.derrotas += 1;
    }

    const par1 = parejaMap.get(id1);
    const par2 = parejaMap.get(id2);
    if (par1) {
      puntosJugador.set(
        par1.jugador1_id,
        (puntosJugador.get(par1.jugador1_id) ?? 0) + s1
      );
      puntosJugador.set(
        par1.jugador2_id,
        (puntosJugador.get(par1.jugador2_id) ?? 0) + s1
      );
    }
    if (par2) {
      puntosJugador.set(
        par2.jugador1_id,
        (puntosJugador.get(par2.jugador1_id) ?? 0) + s2
      );
      puntosJugador.set(
        par2.jugador2_id,
        (puntosJugador.get(par2.jugador2_id) ?? 0) + s2
      );
    }
  }

  const rankingParejasRaw: ParejaJornadaStat[] = parejas.map((p) => {
    const st = statsPareja.get(p.id) ?? {
      puntos: 0,
      victorias: 0,
      empates: 0,
      derrotas: 0,
      games_favor: 0,
    };
    return {
      parejaId: p.id,
      nombre: parejaDisplayName(p),
      puntos: st.puntos,
      victorias: st.victorias,
      empates: st.empates,
      derrotas: st.derrotas,
      games_favor: st.games_favor,
    };
  });

  rankingParejasRaw.sort((a, b) => {
    if (parejasFijas) {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if (b.victorias !== a.victorias) return b.victorias - a.victorias;
      if (b.games_favor !== a.games_favor) return b.games_favor - a.games_favor;
      return a.nombre.localeCompare(b.nombre);
    }
    if (b.victorias !== a.victorias) return b.victorias - a.victorias;
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    return a.nombre.localeCompare(b.nombre);
  });

  const rankingParejas = rankingParejasRaw.map((row, idx) => ({
    ...row,
    posicion: idx + 1,
  }));

  const ganadorPareja =
    rankingParejas.length > 0 && partidos.length > 0
      ? rankingParejas[0]
      : null;

  const rankingJugadoresRaw: JugadorJornadaStat[] = Array.from(
    puntosJugador.entries()
  ).map(([jugadorId, puntos]) => ({
    jugadorId,
    nombre: nombreJugador.get(jugadorId) ?? "Jugador",
    puntos,
  }));

  rankingJugadoresRaw.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));

  const rankingJugadores = rankingJugadoresRaw.map((row, idx) => ({
    ...row,
    posicion: idx + 1,
  }));

  return {
    rankingJugadores,
    rankingParejas,
    ganadorPareja,
  };
}
