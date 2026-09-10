import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../rivieraJugadores/constants";

/** Fuerzas que un coach puede entrenar — misma escala que jugadores. */
export const COACH_FUERZAS_ORDER = JUGADOR_CATEGORIAS_ORDER;

export const COACH_FUERZA_LABELS = JUGADOR_CATEGORIA_LABELS;

export type CoachEspecialidad =
  | "Técnica"
  | "Táctica"
  | "Defensa"
  | "Ataque"
  | "Transición"
  | "Posicionamiento"
  | "Toma de decisiones"
  | "Consistencia"
  | "Competencia"
  | "Físico";

export const COACH_ESPECIALIDADES_ORDER: CoachEspecialidad[] = [
  "Técnica",
  "Táctica",
  "Defensa",
  "Ataque",
  "Transición",
  "Posicionamiento",
  "Toma de decisiones",
  "Consistencia",
  "Competencia",
  "Físico",
];

export function formatCoachFuerzas(
  fuerzas: string[] | null | undefined
): string {
  if (!fuerzas?.length) return "";
  return fuerzas
    .map((f) => {
      if (f in COACH_FUERZA_LABELS) {
        return COACH_FUERZA_LABELS[f as RivieraJugadorCategoria];
      }
      return f;
    })
    .join(" · ");
}
