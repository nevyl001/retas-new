/**
 * Presentación de la vista pública Round Robin.
 * No altera emparejamientos, rondas ni marcadores: solo elige qué ronda
 * mostrar como protagonista y qué estado se puede afirmar.
 */

export type PublicRoundFocusStatus =
  | "live"
  | "completed"
  | "upcoming"
  | "plain";

export type PublicRoundSnapshot = {
  key: string;
  matchCount: number;
  finishedCount: number;
};

export type PublicRoundFocus = {
  /** Primera ronda incompleta, o la última si todas terminaron. */
  liveKey: string | null;
  nextKey: string | null;
  statusByKey: Record<string, PublicRoundFocusStatus>;
};

export function resolvePublicRoundFocus(
  rounds: PublicRoundSnapshot[],
  options: {
    schedulePhase: string;
    tournamentFinished: boolean;
  }
): PublicRoundFocus {
  const statusByKey: Record<string, PublicRoundFocusStatus> = {};
  if (rounds.length === 0) {
    return { liveKey: null, nextKey: null, statusByKey };
  }

  const allComplete =
    options.tournamentFinished ||
    rounds.every(
      (round) => round.matchCount > 0 && round.finishedCount === round.matchCount
    );

  const liveIndex = allComplete
    ? rounds.length - 1
    : Math.max(
        0,
        rounds.findIndex(
          (round) =>
            round.matchCount === 0 || round.finishedCount < round.matchCount
        )
      );

  rounds.forEach((round, index) => {
    const complete =
      round.matchCount > 0 && round.finishedCount === round.matchCount;
    if (options.tournamentFinished || complete || index < liveIndex) {
      statusByKey[round.key] = "completed";
      return;
    }
    if (index === liveIndex) {
      if (options.schedulePhase === "upcoming" && round.finishedCount === 0) {
        statusByKey[round.key] = "upcoming";
        return;
      }
      statusByKey[round.key] = "live";
      return;
    }
    statusByKey[round.key] = "plain";
  });

  const liveKey = rounds[liveIndex]?.key ?? null;
  const nextKey =
    allComplete || liveIndex >= rounds.length - 1
      ? null
      : rounds[liveIndex + 1]?.key ?? null;

  return { liveKey, nextKey, statusByKey };
}
