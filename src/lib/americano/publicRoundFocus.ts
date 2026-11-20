type RoundScore = {
  scoreA?: number | null;
  scoreB?: number | null;
};

export type AmericanoRoundFocus = {
  matches: RoundScore[];
};

function hasFullScore(round: AmericanoRoundFocus): boolean {
  return (
    round.matches.length > 0 &&
    round.matches.every(
      (match) =>
        typeof match.scoreA === "number" && typeof match.scoreB === "number"
    )
  );
}

function hasAnyScore(round: AmericanoRoundFocus): boolean {
  return round.matches.some(
    (match) =>
      typeof match.scoreA === "number" || typeof match.scoreB === "number"
  );
}

/** Primera ronda abierta. Si todas están cerradas, la última. */
export function americanoInPlayRoundIndex(
  rounds: AmericanoRoundFocus[]
): number {
  if (rounds.length === 0) return 0;
  const open = rounds.findIndex((round) => !hasFullScore(round));
  return open === -1 ? rounds.length - 1 : open;
}

/**
 * La ronda abierta está en juego cuando la anterior ya tiene resultado,
 * o cuando en esta ya hay al menos un marcador. El horario del evento no decide.
 */
export function americanoRoundIsInPlay(
  rounds: AmericanoRoundFocus[],
  index: number
): boolean {
  const round = rounds[index];
  if (!round || hasFullScore(round)) return false;
  if (index > 0 && rounds[index - 1] && hasFullScore(rounds[index - 1]!)) {
    return true;
  }
  return hasAnyScore(round);
}
