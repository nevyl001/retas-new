import type {
  TorneoExpressClasificacionModo,
  TorneoExpressPartidoFormato,
} from "./types";
import {
  DEFAULT_CLASIFICACION_MODO,
  DEFAULT_PARTIDO_FORMATO,
} from "./types";

export type ClasificacionModoOption = {
  value: TorneoExpressClasificacionModo;
  label: string;
  /** Una línea de contexto bajo el título. */
  description: string;
  /** Criterios en orden, para UI de reglas. */
  steps: readonly string[];
  /** Orden corto para help / public summary. */
  orderSummary: string;
};

export type PartidoFormatoOption = {
  value: TorneoExpressPartidoFormato;
  label: string;
  description: string;
  steps?: readonly string[];
};

export const CLASIFICACION_MODO_OPTIONS: readonly ClasificacionModoOption[] = [
  {
    value: "dif_puntos",
    label: "Games a favor",
    description: "Gana quien acumule más games. Si empatan, se desempata así:",
    steps: [
      "1. Games ganados (a favor)",
      "2. Diferencia de games (ganados − recibidos)",
      "3. Partidos ganados",
      "4. Cara a cara (enfrentamiento directo)",
    ],
    orderSummary: "FAV → DIF → PG → H2H",
  },
  {
    value: "setto_pg",
    label: "Partidos ganados",
    description:
      "Cada partido ganado vale 2 puntos. Si empatan, se desempata así:",
    steps: [
      "1. Puntos (2 por partido ganado)",
      "2. Diferencia de games (a favor − en contra)",
      "3. Cara a cara (enfrentamiento directo)",
    ],
    orderSummary: "PTS → DIF → H2H",
  },
] as const;

export const PARTIDO_FORMATO_OPTIONS: readonly PartidoFormatoOption[] = [
  {
    value: "flexible",
    label: "Flexible (1 set o mejor de 3)",
    description: "Tú eliges cómo capturar cada partido:",
    steps: [
      "1 set: un solo marcador (0–99)",
      "Mejor de 3: añade sets hasta que alguien gane 2",
    ],
  },
  {
    value: "bo3_super_muerte",
    label: "Mejor de 3 · 3er set súper muerte",
    description: "Todos los partidos al mejor de 3 sets:",
    steps: [
      "Gana quien lleve 2 sets",
      "Si van 1–1, el Set 3 puede ser set normal o súper muerte; tú eliges al capturar",
    ],
  },
] as const;

export function resolveClasificacionModo(
  raw: string | null | undefined
): TorneoExpressClasificacionModo {
  if (raw === "setto_pg" || raw === "dif_puntos") return raw;
  return DEFAULT_CLASIFICACION_MODO;
}

export function resolvePartidoFormato(
  raw: string | null | undefined
): TorneoExpressPartidoFormato {
  if (raw === "bo3_super_muerte" || raw === "flexible") return raw;
  return DEFAULT_PARTIDO_FORMATO;
}

export function clasificacionOrderSummary(
  modo: TorneoExpressClasificacionModo
): string {
  const opt = CLASIFICACION_MODO_OPTIONS.find((o) => o.value === modo);
  return opt?.orderSummary ?? CLASIFICACION_MODO_OPTIONS[0].orderSummary;
}

export type ClasificacionAchievementStat = {
  label: string;
  value: string;
  /** Resaltar valores positivos de diferencia. */
  highlight?: boolean;
};

export type ClasificacionAchievementInput = {
  pg: number;
  ptsFav: number;
  dif: number;
  /** 2 por partido ganado. Si falta, se calcula como pg × 2. */
  puntos?: number;
  /** Diferencia de sets (favor − contra). Ya no ordena setto_pg. */
  setsDif?: number;
};

function formatSignedStat(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

/**
 * Tres métricas de la card de logro / share, alineadas al modo de clasificación
 * para que se entienda por qué quedó arriba en la tabla.
 */
export function clasificacionAchievementStats(
  modo: TorneoExpressClasificacionModo,
  row: ClasificacionAchievementInput
): ClasificacionAchievementStat[] {
  if (modo === "setto_pg") {
    const puntos = row.puntos ?? row.pg * 2;
    return [
      { label: "PTS", value: String(puntos) },
      { label: "FAV", value: String(row.ptsFav) },
      {
        label: "DIF",
        value: formatSignedStat(row.dif),
        highlight: row.dif > 0,
      },
    ];
  }
  return [
    { label: "FAV", value: String(row.ptsFav) },
    {
      label: "DIF",
      value: formatSignedStat(row.dif),
      highlight: row.dif > 0,
    },
    { label: "PG", value: String(row.pg) },
  ];
}

export type ClasificacionStandingHighlight = {
  label: string;
  value: string;
};

export type ClasificacionStandingMetaStat = {
  label: string;
  value: string;
};

/** Valor grande a la derecha de cada fila en la lista pública de grupo. */
export function clasificacionStandingHighlight(
  modo: TorneoExpressClasificacionModo,
  row: ClasificacionAchievementInput
): ClasificacionStandingHighlight {
  if (modo === "setto_pg") {
    return { label: "PTS", value: String(row.puntos ?? row.pg * 2) };
  }
  return { label: "FAV", value: String(row.ptsFav) };
}

/**
 * Stats bajo el nombre. La misma línea en móvil y escritorio:
 * PJ, PG, PP y DIF. El número grande (PTS o FAV) sale del highlight.
 */
export function clasificacionStandingMeta(
  modo: TorneoExpressClasificacionModo,
  row: ClasificacionAchievementInput & { pj: number; pp: number }
): ClasificacionStandingMetaStat[] {
  if (modo !== "setto_pg" && modo !== "dif_puntos") return [];
  return [
    { label: "PJ", value: String(row.pj) },
    { label: "PG", value: String(row.pg) },
    { label: "PP", value: String(row.pp) },
    { label: "DIF", value: formatSignedStat(row.dif) },
  ];
}

