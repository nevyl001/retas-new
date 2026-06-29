/**
 * Etiquetas de ronda para Reta Pádel Americano.
 * El generador actual siempre usa `phase: 1`; no existe fase competitiva por ranking.
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
