import {
  parejasFijasVictoryRankingPoints,
  resolveParejasFijasPartidoTotals,
  type LigaPartidoSetScores,
} from "./parejasFijasMatchScore";
import {
  computePlayoffsMatchPoints,
  derivePlayoffsGamesTotals,
  parsePlayoffsSetScoresJson,
} from "./parejasFijasPlayoffsMatchScore";
import { compareEquiposRanking } from "./equiposRanking";
import type { LigaJornada, LigaJornadaPareja } from "./types";

export interface ParejaJornadaStat {
  parejaId: string;
  nombre: string;
  puntos: number;
  victorias: number;
  empates: number;
  derrotas: number;
  games_favor: number;
  games_contra: number;
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

export type ParejaJornadaMatchLine = {
  partidoId: string;
  /** Marcador desde la perspectiva de la pareja (sus games primero). */
  scoreLabel: string;
  points: number;
  /** Nombre de la pareja rival. */
  opponentLabel?: string;
  cancha?: number | null;
};

function formatSignedPoints(points: number): string {
  if (points > 0) return `+${points}`;
  return String(points);
}

function flipPlayoffsScoreLabel(
  score1: number,
  score2: number,
  payload: ReturnType<typeof parsePlayoffsSetScoresJson>,
  side: 1 | 2
): string {
  if (!payload) return side === 1 ? `${score1}-${score2}` : `${score2}-${score1}`;
  if (payload.wo) {
    return side === 1 ? `WO ${score1}-${score2}` : `WO ${score2}-${score1}`;
  }
  const parts: string[] = [];
  if (payload.sets && payload.sets.length === 2) {
    for (const set of payload.sets) {
      parts.push(
        side === 1 ? `${set.p1}-${set.p2}` : `${set.p2}-${set.p1}`
      );
    }
  } else {
    parts.push(side === 1 ? `${score1}-${score2}` : `${score2}-${score1}`);
  }
  if (payload.stb) {
    parts.push(
      side === 1
        ? `STB ${payload.stb.p1}-${payload.stb.p2}`
        : `STB ${payload.stb.p2}-${payload.stb.p1}`
    );
  }
  return parts.join(" · ");
}

/**
 * Desglose por partido de la jornada: marcador + puntos que aportó a cada pareja.
 * Sirve para explicar el total del ranking.
 */
export function buildJornadaParejaMatchBreakdowns(
  jornada: LigaJornada | undefined,
  options?: JornadaPublicStatsOptions
): Map<string, ParejaJornadaMatchLine[]> {
  const parejasFijas = options?.parejasFijas === true;
  const out = new Map<string, ParejaJornadaMatchLine[]>();
  const parejaNombre = new Map<string, string>();
  for (const p of jornada?.parejas ?? []) {
    parejaNombre.set(p.id, parejaDisplayName(p));
  }
  const partidos = (jornada?.partidos ?? []).filter(
    (p) => p.estado === "completed"
  );

  const pushLine = (
    parejaId: string,
    opponentId: string,
    line: Omit<ParejaJornadaMatchLine, "opponentLabel" | "cancha"> & {
      cancha?: number | null;
    }
  ) => {
    if (!out.has(parejaId)) out.set(parejaId, []);
    out.get(parejaId)!.push({
      ...line,
      opponentLabel: parejaNombre.get(opponentId) ?? "Rival",
      cancha: line.cancha ?? null,
    });
  };

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
        pushLine(id1, id2, {
          partidoId: m.id,
          scoreLabel: flipPlayoffsScoreLabel(
            derived.gamesTotalP1,
            derived.gamesTotalP2,
            playoffsPayload,
            1
          ),
          points: computed.result.pointsP1,
          cancha: m.cancha,
        });
        pushLine(id2, id1, {
          partidoId: m.id,
          scoreLabel: flipPlayoffsScoreLabel(
            derived.gamesTotalP1,
            derived.gamesTotalP2,
            playoffsPayload,
            2
          ),
          points: computed.result.pointsP2,
          cancha: m.cancha,
        });
        continue;
      }

      const totals = resolveParejasFijasPartidoTotals({
        score_pareja1: m.score_pareja1,
        score_pareja2: m.score_pareja2,
        set_scores:
          m.set_scores &&
          typeof m.set_scores === "object" &&
          "sets" in m.set_scores
            ? (m.set_scores as LigaPartidoSetScores)
            : null,
      });
      if (!totals) continue;
      const pts1 = parejasFijasVictoryRankingPoints(totals, true);
      const pts2 = parejasFijasVictoryRankingPoints(totals, false);
      pushLine(id1, id2, {
        partidoId: m.id,
        scoreLabel: totals.display,
        points: pts1,
        cancha: m.cancha,
      });
      pushLine(id2, id1, {
        partidoId: m.id,
        scoreLabel: totals.display,
        points: pts2,
        cancha: m.cancha,
      });
      continue;
    }

    const s1 = Number(m.score_pareja1 ?? 0);
    const s2 = Number(m.score_pareja2 ?? 0);
    pushLine(id1, id2, {
      partidoId: m.id,
      scoreLabel: `${s1}-${s2}`,
      points: s1,
      cancha: m.cancha,
    });
    pushLine(id2, id1, {
      partidoId: m.id,
      scoreLabel: `${s2}-${s1}`,
      points: s2,
      cancha: m.cancha,
    });
  }

  return out;
}

export { formatSignedPoints };

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
      games_contra: number;
    }
  >();
  for (const p of parejas) {
    statsPareja.set(p.id, {
      puntos: 0,
      victorias: 0,
      empates: 0,
      derrotas: 0,
      games_favor: 0,
      games_contra: 0,
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
          st1.games_contra += derived.gamesTotalP2;
          if (computed.result.p1Won) st1.victorias += 1;
          else st1.derrotas += 1;
        }
        if (st2) {
          st2.puntos += computed.result.pointsP2;
          st2.games_favor += derived.gamesTotalP2;
          st2.games_contra += derived.gamesTotalP1;
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
            ? (m.set_scores as LigaPartidoSetScores)
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
        st1.games_contra += totals.gamesP2;
        if (totals.p1WonMatch) st1.victorias += 1;
        else st1.derrotas += 1;
      }
      if (st2) {
        st2.puntos += pts2;
        st2.games_favor += totals.gamesP2;
        st2.games_contra += totals.gamesP1;
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
      st1.games_contra += s2;
      if (s1 > s2) st1.victorias += 1;
      else if (s1 === s2) st1.empates += 1;
      else st1.derrotas += 1;
    }
    if (st2) {
      st2.puntos += s2;
      st2.games_favor += s2;
      st2.games_contra += s1;
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
      games_contra: 0,
    };
    return {
      parejaId: p.id,
      nombre: parejaDisplayName(p),
      puntos: st.puntos,
      victorias: st.victorias,
      empates: st.empates,
      derrotas: st.derrotas,
      games_favor: st.games_favor,
      games_contra: st.games_contra,
    };
  });

  rankingParejasRaw.sort((a, b) => {
    if (parejasFijas) {
      return compareEquiposRanking(
        {
          puntos: a.puntos,
          diferencia_games: a.games_favor - a.games_contra,
          games_favor: a.games_favor,
          partidos_ganados: a.victorias,
          partidos_jugados: a.victorias + a.derrotas + a.empates,
          nombre: a.nombre,
        },
        {
          puntos: b.puntos,
          diferencia_games: b.games_favor - b.games_contra,
          games_favor: b.games_favor,
          partidos_ganados: b.victorias,
          partidos_jugados: b.victorias + b.derrotas + b.empates,
          nombre: b.nombre,
        }
      );
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
