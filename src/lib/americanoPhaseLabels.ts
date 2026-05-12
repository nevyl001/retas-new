/**
 * Etapas del Americano Dinámico (primera / segunda mitad de rondas).
 */
export function americanoPhaseLabel(phase: number): string {
  if (phase === 1) return "Primera mitad";
  if (phase === 2) return "Segunda mitad";
  return `Etapa ${phase}`;
}

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
