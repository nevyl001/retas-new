/**
 * Puntos individuales rotativos: cada jugador suma los games/puntos de su pareja
 * en partidos completed. Misma regla que recalcularPuntosLiga.
 */

export type PartidoPuntosInput = {
  estado: string;
  score_pareja1?: number | null;
  score_pareja2?: number | null;
  pareja1_id: string;
  pareja2_id: string;
};

export type ParejaPuntosInput = {
  id: string;
  jugador1_id: string;
  jugador2_id: string;
};

export function computePuntosPorJugadorDesdePartidos(
  partidos: readonly PartidoPuntosInput[],
  parejas: readonly ParejaPuntosInput[]
): Map<string, number> {
  const parejaPlayers = new Map<string, { j1: string; j2: string }>();
  for (const p of parejas) {
    parejaPlayers.set(String(p.id), {
      j1: String(p.jugador1_id),
      j2: String(p.jugador2_id),
    });
  }

  const puntosPorJugador = new Map<string, number>();

  for (const m of partidos) {
    if (m.estado !== "completed") continue;
    const s1 = Number(m.score_pareja1 ?? 0);
    const s2 = Number(m.score_pareja2 ?? 0);
    const p1 = parejaPlayers.get(String(m.pareja1_id));
    const p2 = parejaPlayers.get(String(m.pareja2_id));
    if (p1) {
      puntosPorJugador.set(p1.j1, (puntosPorJugador.get(p1.j1) ?? 0) + s1);
      puntosPorJugador.set(p1.j2, (puntosPorJugador.get(p1.j2) ?? 0) + s1);
    }
    if (p2) {
      puntosPorJugador.set(p2.j1, (puntosPorJugador.get(p2.j1) ?? 0) + s2);
      puntosPorJugador.set(p2.j2, (puntosPorJugador.get(p2.j2) ?? 0) + s2);
    }
  }

  return puntosPorJugador;
}

/** Solo aporta al acumulado oficial si todos sus partidos están completed. */
export function jornadaCompletaAportaPuntos(jornada: {
  partidos?: readonly { estado: string }[] | null;
}): boolean {
  const lista = jornada.partidos ?? [];
  return lista.length > 0 && lista.every((p) => p.estado === "completed");
}
