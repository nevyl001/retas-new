/**
 * Etapas del Americano Dinámico (primera / segunda mitad de rondas).
 */
export function americanoPhaseLabel(phase: number): string {
  if (phase === 1) return "Primera mitad";
  if (phase === 2) return "Segunda mitad";
  return `Etapa ${phase}`;
}

/** Texto para emparejamientos de 2.ª mitad (mismo criterio que la tabla). */
export const AMERICANO_SECOND_HALF_PAIRING_HELP =
  "En la 2.ª mitad armamos parejas con el mismo criterio que la tabla: más FAV, luego DIF y enfrentamiento directo (H2H). Si empatan 1-1 en cruces, gana quien ganó el último — nunca por orden alfabético.";

export const AMERICANO_SECOND_HALF_PAIRING_TITLE =
  "Emparejamientos por nivel (2.ª mitad)";

/**
 * Etiqueta de ronda para UI: la última ronda del torneo muestra "Final".
 * `totalRounds` debe ser el total planificado (p. ej. del hook); si es 0, no se usa "Final".
 */
export function americanoRoundPhaseCaption(
  round: { roundNumber: number; phase: number },
  totalRounds: number
): string {
  if (totalRounds > 0 && round.roundNumber === totalRounds) {
    return "Final";
  }
  return americanoPhaseLabel(round.phase);
}
