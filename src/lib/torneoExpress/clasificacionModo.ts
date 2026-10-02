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
  description: string;
  /** Orden corto para help / public summary. */
  orderSummary: string;
};

export type PartidoFormatoOption = {
  value: TorneoExpressPartidoFormato;
  label: string;
  description: string;
};

export const CLASIFICACION_MODO_OPTIONS: readonly ClasificacionModoOption[] = [
  {
    value: "dif_puntos",
    label: "Diferencia de puntos (games)",
    description:
      "Ordena por diferencia de games (ganados − recibidos), luego games a favor, partidos ganados y enfrentamiento directo.",
    orderSummary: "DIF → FAV → PG → H2H",
  },
  {
    value: "setto_pg",
    label: "Partidos ganados (estilo Setto)",
    description:
      "Ordena por partidos ganados; con exactamente dos empatados usa cara a cara; luego diferencia de sets, diferencia de games, más sets y más games.",
    orderSummary:
      "PG → H2H (2) → DIF sets → DIF games → sets ganados → games ganados",
  },
] as const;

export const PARTIDO_FORMATO_OPTIONS: readonly PartidoFormatoOption[] = [
  {
    value: "flexible",
    label: "Flexible (1 set o mejor de 3)",
    description:
      "Marcadores 0–99. Un set o mejor de 3 según cómo captures el resultado.",
  },
  {
    value: "bo3_super_muerte",
    label: "Mejor de 3 · 3er set súper muerte",
    description:
      "Al mejor de 3 sets. Si van 1–1, el tercer set debe ser súper tiebreak (a 10 con 2 de ventaja).",
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
