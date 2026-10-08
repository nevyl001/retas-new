import type { BracketFase } from "./bracketTypes";

/**
 * Quién avanza de la fase de grupos al cuadro.
 *
 * - Regla general: pasan el 1.° y el 2.° de cada grupo; si sobran plazas en el
 *   cuadro entran los mejores 3.os.
 * - 7 grupos: pasan solo los 7 primeros lugares + el mejor 2.° (8 equipos,
 *   cuartos de final limpios).
 */
export const GRUPOS_PRIMEROS_Y_MEJOR_SEGUNDO = 7;

export type ReglaClasificacion = {
  /** Posiciones que pasan directo de cada grupo (1 = solo el primero, 2 = 1.° y 2.°). */
  porGrupo: 1 | 2;
  /** Posición de los "mejores" que completan el cuadro (2.° o 3.°). */
  posicionExtra: 2 | 3;
  /** Fase obligatoria cuando la regla cierra exactamente un cuadro. */
  faseUnica: BracketFase | null;
};

export function reglaClasificacion(numGrupos: number): ReglaClasificacion {
  if (numGrupos === GRUPOS_PRIMEROS_Y_MEJOR_SEGUNDO) {
    return { porGrupo: 1, posicionExtra: 2, faseUnica: "cuartos" };
  }
  return { porGrupo: 2, posicionExtra: 3, faseUnica: null };
}

/** "mejor tercero" / "mejores segundos", según la regla. */
export function etiquetaMejoresExtra(
  posicionExtra: 2 | 3,
  cantidad: number
): string {
  const ordinal = posicionExtra === 2 ? "segundo" : "tercero";
  return cantidad === 1 ? `mejor ${ordinal}` : `mejores ${ordinal}s`;
}
