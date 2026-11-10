import {
  computePuntosPorJugadorDesdePartidos,
  jornadaCompletaAportaPuntos,
} from "./puntosPorJugador";
import type { LigaInscripcion, LigaJornada } from "./types";

export type RankingIndividualAcumuladoRow = {
  jugadorId: string;
  nombre: string;
  /** Suma oficial hasta la jornada (partidos completed + herencia de plaza). */
  puntos: number;
  /** Puntos propios de partidos en jornadas completed ≤ hastaNumero. */
  puntosPartidos: number;
  /** Puntos de plaza transferidos (si la plaza ya aplica en este corte). */
  puntosHeredados: number;
  /** Puntos solo de la jornada de corte, si esa jornada ya aporta. */
  puntosJornada: number;
  jornadasJugadas: number;
  posicion: number;
  ingresoJornadaNumero: number | null;
};

export type SustitucionAcumuladoInput = {
  fromJugadorId: string;
  toJugadorId: string;
  jornadaEfectivaNumero: number;
};

type InscripcionAcumulado = Pick<
  LigaInscripcion,
  "jugador_id" | "puntos_heredados" | "ingreso_jornada_numero" | "jugador"
>;

/**
 * Clasificación individual acumulada hasta `hastaNumero`, misma base que
 * recalcularPuntosLiga / getRanking: solo jornadas fully completed, más
 * puntos_heredados de la plaza cuando el titular ya ingresó.
 *
 * No incluye puntos de jornadas posteriores ni de jornadas incompletas.
 */
export function computeRankingIndividualAcumuladoHasta(input: {
  jornadas: readonly LigaJornada[];
  hastaNumero: number;
  inscripciones: readonly InscripcionAcumulado[];
  /** Si se omite, no se excluye al saliente (puede duplicar con herencia). */
  sustituciones?: readonly SustitucionAcumuladoInput[];
}): RankingIndividualAcumuladoRow[] {
  const hasta = Math.max(0, Math.floor(Number(input.hastaNumero) || 0));
  const jornadasHasta = input.jornadas.filter((j) => j.numero <= hasta);

  const totales = new Map<string, number>();
  const jornadasPorJugador = new Map<string, Set<number>>();
  const puntosJornadaCorte = new Map<string, number>();
  const nombres = new Map<string, string>();

  for (const j of jornadasHasta) {
    for (const p of j.parejas ?? []) {
      if (p.jugador1) nombres.set(p.jugador1_id, p.jugador1.nombre);
      if (p.jugador2) nombres.set(p.jugador2_id, p.jugador2.nombre);
    }
    if (!jornadaCompletaAportaPuntos(j)) continue;
    const pts = computePuntosPorJugadorDesdePartidos(
      j.partidos ?? [],
      j.parejas ?? []
    );
    for (const [jugadorId, value] of Array.from(pts.entries())) {
      totales.set(jugadorId, (totales.get(jugadorId) ?? 0) + value);
      const set = jornadasPorJugador.get(jugadorId) ?? new Set<number>();
      set.add(j.numero);
      jornadasPorJugador.set(jugadorId, set);
      if (j.numero === hasta) {
        puntosJornadaCorte.set(jugadorId, value);
      }
    }
  }

  for (const insc of input.inscripciones) {
    if (insc.jugador?.nombre) {
      nombres.set(insc.jugador_id, insc.jugador.nombre);
    }
  }

  const salientesExcluidos = new Set<string>();
  for (const s of input.sustituciones ?? []) {
    if (s.jornadaEfectivaNumero <= hasta) {
      salientesExcluidos.add(s.fromJugadorId);
    }
  }

  const rows: Omit<RankingIndividualAcumuladoRow, "posicion">[] = [];
  const vistos = new Set<string>();

  for (const insc of input.inscripciones) {
    const ingreso =
      insc.ingreso_jornada_numero == null
        ? null
        : Number(insc.ingreso_jornada_numero);
    if (ingreso != null && ingreso > hasta) continue;

    const jugadorId = insc.jugador_id;
    vistos.add(jugadorId);
    const puntosPartidos = totales.get(jugadorId) ?? 0;
    const puntosHeredados = Math.max(0, Number(insc.puntos_heredados ?? 0));
    rows.push({
      jugadorId,
      nombre: nombres.get(jugadorId) ?? insc.jugador?.nombre ?? "Jugador",
      puntos: puntosPartidos + puntosHeredados,
      puntosPartidos,
      puntosHeredados,
      puntosJornada: puntosJornadaCorte.get(jugadorId) ?? 0,
      jornadasJugadas: jornadasPorJugador.get(jugadorId)?.size ?? 0,
      ingresoJornadaNumero: ingreso,
    });
  }

  // Jugadores con puntos en jornadas ≤ N que ya no tienen inscripción vigente
  // (p. ej. saliente visible solo antes de que aplique la herencia en este corte).
  const herenciaActivaEnCorte = input.inscripciones.some((insc) => {
    const ingreso =
      insc.ingreso_jornada_numero == null
        ? null
        : Number(insc.ingreso_jornada_numero);
    if (ingreso != null && ingreso > hasta) return false;
    return Math.max(0, Number(insc.puntos_heredados ?? 0)) > 0;
  });
  const sinListaSustituciones =
    input.sustituciones == null || input.sustituciones.length === 0;

  for (const [jugadorId, puntosPartidos] of Array.from(totales.entries())) {
    if (vistos.has(jugadorId)) continue;
    if (salientesExcluidos.has(jugadorId)) continue;
    // Sin RPC de sustituciones: si ya hay herencia activa en el corte,
    // no listar huérfanos para no duplicar puntos de plaza transferidos.
    if (sinListaSustituciones && herenciaActivaEnCorte) continue;
    rows.push({
      jugadorId,
      nombre: nombres.get(jugadorId) ?? "Jugador",
      puntos: puntosPartidos,
      puntosPartidos,
      puntosHeredados: 0,
      puntosJornada: puntosJornadaCorte.get(jugadorId) ?? 0,
      jornadasJugadas: jornadasPorJugador.get(jugadorId)?.size ?? 0,
      ingresoJornadaNumero: null,
    });
  }

  rows.sort(
    (a, b) =>
      b.puntos - a.puntos ||
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
  );

  return rows.map((row, idx) => ({
    ...row,
    posicion: idx + 1,
  }));
}
