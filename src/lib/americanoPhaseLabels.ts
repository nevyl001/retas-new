/**
 * Etiquetas de ronda para Reta Pádel Americano (sin fases por ranking).
 */
export function americanoPhaseLabel(_phase: number): string {
  return "Rotación americana";
}

export function americanoRoundPhaseCaption(
  round: { roundNumber: number; phase: number },
  totalRounds: number
): string {
  if (totalRounds > 0 && round.roundNumber === totalRounds) {
    return "Ronda final";
  }
  return "";
}
