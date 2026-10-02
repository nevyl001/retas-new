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
      "Gana quien gane más partidos. Si empatan, se desempata así:",
    steps: [
      "1. Partidos ganados",
      "2. Cara a cara (solo si empatan exactamente 2 parejas)",
      "3. Diferencia de sets",
      "4. Diferencia de games",
      "5. Más sets ganados",
      "6. Más games ganados",
    ],
    orderSummary:
      "PG → H2H (2) → DIF sets → DIF games → sets ganados → games ganados",
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
      "Si van 1–1, el Set 3 es súper muerte (a 10, con 2 de ventaja)",
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

/** Texto largo legible para criterios públicos / help. */
export function clasificacionStepsSummary(
  modo: TorneoExpressClasificacionModo
): string {
  const opt = CLASIFICACION_MODO_OPTIONS.find((o) => o.value === modo);
  if (!opt) return clasificacionOrderSummary(modo);
  return `${opt.description} ${opt.steps.join(" · ")}`;
}
