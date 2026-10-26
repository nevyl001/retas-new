import type { AmericanoScoreRevision } from "./americanoScoreEdit";
import { parseAmericanoScore } from "./americanoScoreEdit";

export type AmericanoRoundStatus = "pendiente" | "en_juego" | "finalizada";

export const AMERICANO_ROUND_STATUS_LABEL: Record<AmericanoRoundStatus, string> =
  {
    pendiente: "Pendiente",
    en_juego: "En juego",
    finalizada: "Finalizada",
  };

export interface AmericanoJourneyPlayer {
  id: string;
  name: string;
}

export interface AmericanoJourneyMatch {
  id: string;
  court: number;
  scoreA?: number;
  scoreB?: number;
  scoreRevision?: AmericanoScoreRevision;
  teamA: AmericanoJourneyPlayer[];
  teamB: AmericanoJourneyPlayer[];
}

export interface AmericanoJourneyRound {
  roundNumber: number;
  matches: AmericanoJourneyMatch[];
  benchPlayers: AmericanoJourneyPlayer[];
}

export type AmericanoJourneyResult = "G" | "P" | "E";

export interface AmericanoPlayerRoundCell {
  roundNumber: number;
  kind: "match" | "bench" | "pending";
  matchId?: string;
  court?: number;
  partnerId?: string;
  partnerName?: string;
  rivalIds?: [string, string];
  rivalNames?: [string, string];
  scoreFavor?: number;
  scoreContra?: number;
  result?: AmericanoJourneyResult;
}

function validScore(value: number | undefined): number | null {
  return parseAmericanoScore(value);
}

export function isAmericanoMatchScored(match: {
  scoreA?: number;
  scoreB?: number;
}): boolean {
  return validScore(match.scoreA) != null && validScore(match.scoreB) != null;
}

/** Estado visible de una ronda ya generada. No inventa rondas futuras. */
export function deriveAmericanoRoundStatus(
  round: { matches: { scoreA?: number; scoreB?: number }[] },
  opts: { isCurrent: boolean; tournamentFinished: boolean }
): AmericanoRoundStatus {
  if (round.matches.length === 0) return "pendiente";
  const complete = round.matches.every(isAmericanoMatchScored);
  if (opts.tournamentFinished || (!opts.isCurrent && complete)) {
    return "finalizada";
  }
  if (opts.isCurrent) return "en_juego";
  return complete ? "finalizada" : "pendiente";
}

function resultOf(favor: number, contra: number): AmericanoJourneyResult {
  if (favor > contra) return "G";
  if (favor < contra) return "P";
  return "E";
}

function cellForRound(
  playerId: string,
  round: AmericanoJourneyRound
): AmericanoPlayerRoundCell {
  if (round.benchPlayers.some((player) => player.id === playerId)) {
    return { roundNumber: round.roundNumber, kind: "bench" };
  }

  for (const match of round.matches) {
    const inA = match.teamA.some((player) => player.id === playerId);
    const inB = match.teamB.some((player) => player.id === playerId);
    if (!inA && !inB) continue;
    const own = inA ? match.teamA : match.teamB;
    const rivals = inA ? match.teamB : match.teamA;
    const partner = own.find((player) => player.id !== playerId);
    const favorRaw = inA ? match.scoreA : match.scoreB;
    const contraRaw = inA ? match.scoreB : match.scoreA;
    const favor = validScore(favorRaw);
    const contra = validScore(contraRaw);
    const scored = favor != null && contra != null;
    return {
      roundNumber: round.roundNumber,
      kind: "match",
      matchId: match.id,
      court: match.court,
      partnerId: partner?.id,
      partnerName: partner?.name,
      rivalIds: [rivals[0]?.id ?? "", rivals[1]?.id ?? ""],
      rivalNames: [rivals[0]?.name ?? "", rivals[1]?.name ?? ""],
      scoreFavor: scored ? favor : undefined,
      scoreContra: scored ? contra : undefined,
      result: scored ? resultOf(favor, contra) : undefined,
    };
  }

  return { roundNumber: round.roundNumber, kind: "pending" };
}

/**
 * Recorrido de un jugador a partir de partidos y descansos reales.
 * Las rondas planificadas que aún no existen quedan en "Pendiente", sin partidos inventados.
 */
export function buildAmericanoPlayerJourney(
  playerId: string,
  rounds: AmericanoJourneyRound[],
  totalRounds: number
): AmericanoPlayerRoundCell[] {
  const byNumber = new Map(rounds.map((round) => [round.roundNumber, round]));
  const generatedMax = rounds.reduce(
    (max, round) => Math.max(max, round.roundNumber),
    0
  );
  const columns = Math.max(totalRounds, generatedMax, 0);
  const cells: AmericanoPlayerRoundCell[] = [];
  for (let roundNumber = 1; roundNumber <= columns; roundNumber += 1) {
    const round = byNumber.get(roundNumber);
    cells.push(
      round
        ? cellForRound(playerId, round)
        : { roundNumber, kind: "pending" }
    );
  }
  return cells;
}
