import {
  computePuntosPorJugadorDesdePartidos,
  jornadaCompletaAportaPuntos,
} from "./puntosPorJugador";
import type { LigaInscripcion, LigaJornada } from "./types";

export type RankingIndividualAcumuladoRow = {
  jugadorId: string;
  nombre: string;
  /**
   * Puntos oficiales del corte:
   * - Si el corte cubre todas las jornadas completed actuales → liga_inscripciones.puntos
   *   (incluye penalizaciones/bonificaciones/ajustes administrativos vigentes).
   * - Si el corte es histórico estricto (hay completed posteriores) → solo partidos ≤ N
   *   + herencia aplicable (sin inventar jornada de ajuste: el ledger no la guarda).
   */
  puntos: number;
  /** Suma de games/puntos de partidos completed con numero ≤ hastaNumero. */
  puntosPartidos: number;
  /** Puntos de plaza transferidos (si la plaza ya aplica en este corte). */
  puntosHeredados: number;
  /** Puntos solo de la jornada de corte, si esa jornada ya aporta. */
  puntosJornada: number;
  /** Residual oficial vs partidos+herencia cuando el corte usa insc.puntos. */
  puntosAjuste: number;
  puntosAjusteMotivo: string | null;
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
  | "jugador_id"
  | "puntos"
  | "puntos_heredados"
  | "ingreso_jornada_numero"
  | "puntos_ajuste_motivo"
  | "puntos_ajuste_at"
  | "jugador"
>;

/** Máximo numero de jornada que ya aporta al total oficial (fully completed). */
export function maxJornadaCompletaQueAporta(
  jornadas: readonly LigaJornada[]
): number {
  let max = 0;
  for (const j of jornadas) {
    if (!jornadaCompletaAportaPuntos(j)) continue;
    if (j.numero > max) max = j.numero;
  }
  return max;
}

/**
 * Clasificación individual acumulada hasta `hastaNumero`.
 *
 * Misma fuente que getRanking cuando el corte incluye todas las jornadas
 * completed vigentes: `liga_inscripciones.puntos` (partidos + herencia +
 * ajustes administrativos absolutos).
 *
 * Si la jornada de corte aún no está consolidada, suma en vivo los partidos
 * `completed` de esa jornada (por ronda) encima del total oficial previo, para
 * que la tabla pública avance con cada ronda cerrada.
 *
 * El ledger `liga_puntos_correcciones` no guarda jornada efectiva; por eso no
 * se redistribuyen ajustes a cortes históricos anteriores a completed posteriores.
 */
export function computeRankingIndividualAcumuladoHasta(input: {
  jornadas: readonly LigaJornada[];
  hastaNumero: number;
  inscripciones: readonly InscripcionAcumulado[];
  /** Si se omite, no se excluye al saliente (puede duplicar con herencia). */
  sustituciones?: readonly SustitucionAcumuladoInput[];
}): RankingIndividualAcumuladoRow[] {
  const hasta = Math.max(0, Math.floor(Number(input.hastaNumero) || 0));
  const maxCompleta = maxJornadaCompletaQueAporta(input.jornadas);
  const usarTotalOficialInscripcion = hasta >= maxCompleta && maxCompleta > 0;
  const jornadasHasta = input.jornadas.filter((j) => j.numero <= hasta);
  const jornadaCorte = jornadasHasta.find((j) => j.numero === hasta) ?? null;
  const corteEnVivo =
    jornadaCorte != null && !jornadaCompletaAportaPuntos(jornadaCorte);

  const totales = new Map<string, number>();
  const jornadasPorJugador = new Map<string, Set<number>>();
  const puntosJornadaCorte = new Map<string, number>();
  const nombres = new Map<string, string>();

  for (const j of jornadasHasta) {
    for (const p of j.parejas ?? []) {
      if (p.jugador1) nombres.set(p.jugador1_id, p.jugador1.nombre);
      if (p.jugador2) nombres.set(p.jugador2_id, p.jugador2.nombre);
    }
    const aportaCompleta = jornadaCompletaAportaPuntos(j);
    const aportaEnVivo = corteEnVivo && j.numero === hasta;
    if (!aportaCompleta && !aportaEnVivo) continue;
    const pts = computePuntosPorJugadorDesdePartidos(
      j.partidos ?? [],
      j.parejas ?? []
    );
    for (const [jugadorId, value] of Array.from(pts.entries())) {
      totales.set(jugadorId, (totales.get(jugadorId) ?? 0) + value);
      if (value > 0 || aportaCompleta) {
        const set = jornadasPorJugador.get(jugadorId) ?? new Set<number>();
        set.add(j.numero);
        jornadasPorJugador.set(jugadorId, set);
      }
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
    const basePartidosHerencia = puntosPartidos + puntosHeredados;
    const puntosOficialesInsc = Math.max(0, Number(insc.puntos ?? 0));
    const liveExtra = corteEnVivo
      ? Math.max(0, puntosJornadaCorte.get(jugadorId) ?? 0)
      : 0;
    const motivoRaw =
      typeof insc.puntos_ajuste_motivo === "string"
        ? insc.puntos_ajuste_motivo.trim()
        : "";
    const motivo = motivoRaw || null;

    // insc.puntos aún no incluye la jornada en curso; se suma el parcial live.
    const puntos = usarTotalOficialInscripcion
      ? puntosOficialesInsc + liveExtra
      : basePartidosHerencia;
    const puntosAjuste = usarTotalOficialInscripcion
      ? puntos - basePartidosHerencia
      : 0;

    rows.push({
      jugadorId,
      nombre: nombres.get(jugadorId) ?? insc.jugador?.nombre ?? "Jugador",
      puntos,
      puntosPartidos,
      puntosHeredados,
      puntosJornada: puntosJornadaCorte.get(jugadorId) ?? 0,
      puntosAjuste,
      puntosAjusteMotivo: usarTotalOficialInscripcion ? motivo : null,
      jornadasJugadas: jornadasPorJugador.get(jugadorId)?.size ?? 0,
      ingresoJornadaNumero: ingreso,
    });
  }

  // Jugadores con puntos en jornadas ≤ N que ya no tienen inscripción vigente.
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
    if (sinListaSustituciones && herenciaActivaEnCorte) continue;
    // Sin inscripción vigente no hay total oficial ni ajuste administrativo.
    rows.push({
      jugadorId,
      nombre: nombres.get(jugadorId) ?? "Jugador",
      puntos: puntosPartidos,
      puntosPartidos,
      puntosHeredados: 0,
      puntosJornada: puntosJornadaCorte.get(jugadorId) ?? 0,
      puntosAjuste: 0,
      puntosAjusteMotivo: null,
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
