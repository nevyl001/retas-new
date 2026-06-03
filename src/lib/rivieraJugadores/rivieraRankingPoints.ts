/**
 * Puntos de ranking global Riviera Open (jugador_stats.puntos_totales).
 * Solo sumas; se aplican al cerrar cada evento vía syncParticipaciones.
 */

export const RANKING_PUNTOS_ESQUEMA = "riviera_open_v1";

export const PUNTOS_LIGA = {
  BASE_INSCRIPCION: 100,
  GANAR_JORNADA: 50,
  PRIMER_LUGAR: 500,
  SEGUNDO_LUGAR: 250,
  TERCER_LUGAR: 100,
} as const;

export const PUNTOS_RETA = {
  PARTICIPACION: 20,
  VICTORIA: 50,
} as const;

export const PUNTOS_RETA_EQUIPOS = {
  PARTICIPACION: 20,
  VICTORIA: 50,
} as const;

export const PUNTOS_AMERICANO = {
  PARTICIPACION: 30,
  POR_VICTORIA: 5,
  PRIMER_LUGAR: 80,
  SEGUNDO_LUGAR: 40,
  TERCER_LUGAR: 20,
} as const;

export const PUNTOS_EXPRESS = {
  PARTICIPACION: 50,
  LLEGAR_SEMI: 50,
  PRIMER_LUGAR: 300,
  SEGUNDO_LUGAR: 150,
  TERCER_LUGAR: 50,
} as const;

export type RivieraRankingFormato =
  | "liga"
  | "reta"
  | "reta_equipos"
  | "americano"
  | "express";

export interface CalcularPuntosEventoParams {
  formato: RivieraRankingFormato;
  /** Liga: primera inscripción en la temporada */
  esNuevoEnLiga?: boolean;
  /** Liga: cuántas jornadas ganó en este registro (normalmente 0 o 1) */
  jornadas_ganadas?: number;
  /** Liga (cierre), americano, express, reta individual: 1, 2, 3, 4… */
  posicion_final?: number | null;
  /** Americano: victorias en duelos 1v1 (PG de standings) */
  victorias_americano?: number;
  /** Express: llegó a semifinal sin medalla 1–4 */
  llego_semi?: boolean;
  /** Reta por equipos: jugador en el equipo con más marcador */
  equipo_ganador?: boolean;
}

export type PuntosDesglose = Record<string, number>;

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function add(desglose: PuntosDesglose, key: string, pts: number): void {
  const v = clampNonNeg(pts);
  if (v > 0) desglose[key] = (desglose[key] ?? 0) + v;
}

/** Desglose por concepto (auditoría en metadata.puntos_desglose). */
export function calcularPuntosEventoDesglose(
  params: CalcularPuntosEventoParams
): { total: number; desglose: PuntosDesglose } {
  const desglose: PuntosDesglose = {};

  switch (params.formato) {
    case "liga": {
      if (params.esNuevoEnLiga) {
        add(desglose, "liga_inscripcion", PUNTOS_LIGA.BASE_INSCRIPCION);
      }
      const jg = clampNonNeg(params.jornadas_ganadas ?? 0);
      if (jg > 0) {
        add(desglose, "liga_jornada_ganada", jg * PUNTOS_LIGA.GANAR_JORNADA);
      }
      const pos = params.posicion_final;
      if (pos === 1) add(desglose, "liga_podio_1", PUNTOS_LIGA.PRIMER_LUGAR);
      else if (pos === 2) add(desglose, "liga_podio_2", PUNTOS_LIGA.SEGUNDO_LUGAR);
      else if (pos === 3) add(desglose, "liga_podio_3", PUNTOS_LIGA.TERCER_LUGAR);
      break;
    }
    case "reta": {
      add(desglose, "reta_participacion", PUNTOS_RETA.PARTICIPACION);
      if (params.posicion_final === 1) {
        add(desglose, "reta_victoria", PUNTOS_RETA.VICTORIA);
      }
      break;
    }
    case "reta_equipos": {
      add(desglose, "reta_equipos_participacion", PUNTOS_RETA_EQUIPOS.PARTICIPACION);
      if (params.equipo_ganador) {
        add(desglose, "reta_equipos_victoria", PUNTOS_RETA_EQUIPOS.VICTORIA);
      }
      break;
    }
    case "americano": {
      add(desglose, "americano_participacion", PUNTOS_AMERICANO.PARTICIPACION);
      const v = clampNonNeg(params.victorias_americano ?? 0);
      if (v > 0) {
        add(desglose, "americano_victorias", v * PUNTOS_AMERICANO.POR_VICTORIA);
      }
      const pos = params.posicion_final;
      if (pos === 1) add(desglose, "americano_podio_1", PUNTOS_AMERICANO.PRIMER_LUGAR);
      else if (pos === 2) {
        add(desglose, "americano_podio_2", PUNTOS_AMERICANO.SEGUNDO_LUGAR);
      } else if (pos === 3) {
        add(desglose, "americano_podio_3", PUNTOS_AMERICANO.TERCER_LUGAR);
      }
      break;
    }
    case "express": {
      add(desglose, "express_participacion", PUNTOS_EXPRESS.PARTICIPACION);
      const pos = params.posicion_final;
      if (pos === 1) {
        add(desglose, "express_campeon", PUNTOS_EXPRESS.PRIMER_LUGAR);
      } else if (pos === 2) {
        add(desglose, "express_finalista", PUNTOS_EXPRESS.SEGUNDO_LUGAR);
      } else if (pos === 3 || pos === 4) {
        add(desglose, "express_semifinal", PUNTOS_EXPRESS.TERCER_LUGAR);
      } else if (params.llego_semi) {
        add(desglose, "express_llegar_semi", PUNTOS_EXPRESS.LLEGAR_SEMI);
      }
      break;
    }
    default:
      break;
  }

  const total = Object.values(desglose).reduce((a, b) => a + b, 0);
  return { total, desglose };
}

export function calcularPuntosEvento(params: CalcularPuntosEventoParams): number {
  return calcularPuntosEventoDesglose(params).total;
}
