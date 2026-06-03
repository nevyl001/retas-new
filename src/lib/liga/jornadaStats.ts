import type { LigaJornada, LigaJornadaPareja } from "./types";

export interface ParejaJornadaStat {
  parejaId: string;
  nombre: string;
  puntos: number;
  victorias: number;
  empates: number;
  derrotas: number;
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

/** Puntos de jornada por jugador y pareja ganadora (más victorias; desempate por puntos). */
export function computeJornadaPublicStats(
  jornada: LigaJornada | undefined
): JornadaPublicStats {
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
    { puntos: number; victorias: number; empates: number; derrotas: number }
  >();
  for (const p of parejas) {
    statsPareja.set(p.id, { puntos: 0, victorias: 0, empates: 0, derrotas: 0 });
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
    const s1 = Number(m.score_pareja1 ?? 0);
    const s2 = Number(m.score_pareja2 ?? 0);
    const id1 = m.pareja1_id;
    const id2 = m.pareja2_id;

    const st1 = statsPareja.get(id1);
    const st2 = statsPareja.get(id2);
    if (st1) {
      st1.puntos += s1;
      if (s1 > s2) st1.victorias += 1;
      else if (s1 === s2) st1.empates += 1;
      else st1.derrotas += 1;
    }
    if (st2) {
      st2.puntos += s2;
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
    };
    return {
      parejaId: p.id,
      nombre: parejaDisplayName(p),
      puntos: st.puntos,
      victorias: st.victorias,
      empates: st.empates,
      derrotas: st.derrotas,
    };
  });

  rankingParejasRaw.sort((a, b) => {
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
