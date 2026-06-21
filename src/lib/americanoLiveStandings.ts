import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import {
  applyAmericanoResult,
  buildAmericanoPlayerStandingStats,
  getAmericanoRanking,
} from "./americanoStandings";
import type { UnifiedStandingStats } from "./unifiedStandings";

function createEmptyStats() {
  return {
    pointsFor: 0,
    pointsAgainst: 0,
    gamesPlayed: 0,
    roundsOnBench: 0,
  };
}

/** Rondas con todos los marcadores confirmados (≥ 0). */
export function isAmericanoRoundFullyScored(round: AmericanoRound): boolean {
  return (
    round.matches.length > 0 &&
    round.matches.every(
      (m) =>
        typeof m.scoreA === "number" &&
        typeof m.scoreB === "number" &&
        !Number.isNaN(m.scoreA) &&
        !Number.isNaN(m.scoreB) &&
        m.scoreA >= 0 &&
        m.scoreB >= 0
    )
  );
}

export function filterScoredAmericanoRounds(
  rounds: AmericanoRound[]
): AmericanoRound[] {
  return rounds.filter(isAmericanoRoundFullyScored);
}

export function rebuildAmericanoLiveState(
  roster: AmericanoPlayer[],
  rounds: AmericanoRound[]
): { players: AmericanoPlayer[]; rounds: AmericanoRound[] } {
  const rebuiltPlayers = roster.map((p) => ({
    ...p,
    stats: createEmptyStats(),
  }));
  const playerMap = new Map(rebuiltPlayers.map((p) => [p.id, p]));

  const rebuiltRounds: AmericanoRound[] = rounds.map((round) => {
    const benchPlayers = round.benchPlayers
      .map((p) => playerMap.get(p.id))
      .filter((p): p is AmericanoPlayer => !!p);
    benchPlayers.forEach((p) => {
      p.stats.roundsOnBench += 1;
    });

    const matches = round.matches.map((match) => ({
      ...match,
      teamA: [
        playerMap.get(match.teamA[0].id)!,
        playerMap.get(match.teamA[1].id)!,
      ] as [AmericanoPlayer, AmericanoPlayer],
      teamB: [
        playerMap.get(match.teamB[0].id)!,
        playerMap.get(match.teamB[1].id)!,
      ] as [AmericanoPlayer, AmericanoPlayer],
    }));

    return {
      ...round,
      matches,
      benchPlayers,
    };
  });

  rebuiltRounds.forEach((round) => {
    if (!isAmericanoRoundFullyScored(round)) return;
    round.matches.forEach((match) => {
      applyAmericanoResult(match, match.scoreA!, match.scoreB!);
    });
  });

  return { players: rebuiltPlayers, rounds: rebuiltRounds };
}

export function rosterSeedMap(
  roster: AmericanoPlayer[]
): Map<string, number> {
  return new Map(roster.map((p, i) => [p.id, i]));
}

/** Única fuente de verdad: tabla = emparejamientos 2.ª mitad. */
export function computeAmericanoLiveRanking(
  roster: AmericanoPlayer[],
  rounds: AmericanoRound[]
): AmericanoPlayer[] {
  if (roster.length === 0) return [];
  const scored = filterScoredAmericanoRounds(rounds);
  const { players } = rebuildAmericanoLiveState(roster, scored);
  return getAmericanoRanking(players, scored, {
    seedById: rosterSeedMap(roster),
  });
}

export function computeAmericanoLiveStatsMap(
  roster: AmericanoPlayer[],
  rounds: AmericanoRound[]
): Map<string, UnifiedStandingStats> {
  const scored = filterScoredAmericanoRounds(rounds);
  const { players } = rebuildAmericanoLiveState(roster, scored);
  return buildAmericanoPlayerStandingStats(players, scored);
}
