import type { Game, Match, Pair } from "./database";
import {
  partitionMatches,
  resolveChampionshipPodium,
  type RoundRobinChampionshipConfig,
} from "./roundRobinChampionship";
import {
  computePairsWithStats,
  sortPairsForStandings,
  type PairWithStats,
} from "./standingsUtils";
import type { TournamentWinner } from "./tournamentWinner";

export interface TournamentPodiumOutcome {
  winner: TournamentWinner | null;
  secondPair: Pair | null;
  thirdPair: Pair | null;
}

function pairToTournamentWinner(
  pair: Pair,
  stats: PairWithStats | undefined
): TournamentWinner {
  const matchesPlayed = stats?.matchesPlayed ?? 0;
  const pg = stats?.pg ?? 0;
  return {
    pair,
    totalPoints: stats?.points ?? 0,
    totalSets: stats?.setsWon ?? 0,
    totalGames: stats?.gamesWon ?? 0,
    matchesPlayed,
    winPercentage: matchesPlayed > 0 ? (pg / matchesPlayed) * 100 : 0,
  };
}

/** Partidos que cuentan para la tabla de clasificación (solo fase regular si hay remontada). */
export function matchesForStandingsTable(
  matches: Match[],
  tournamentId: string,
  champCfg: RoundRobinChampionshipConfig | null | undefined
): Match[] {
  if (!champCfg?.championshipEnabled) return matches;
  const { regular } = partitionMatches(matches, tournamentId, champCfg);
  return regular.length > 0 ? regular : matches;
}

/**
 * Campeón: ganador de remontada si aplica; si no, #1 de la tabla.
 * 2.º y 3.º: siempre posiciones 2 y 3 de la clasificación regular (Round Robin).
 */
export async function resolveTournamentPodiumOutcome(
  pairs: Pair[],
  matches: Match[],
  games: Game[],
  tournamentId: string,
  champCfg: RoundRobinChampionshipConfig | null | undefined
): Promise<TournamentPodiumOutcome> {
  const standingsMatches = matchesForStandingsTable(
    matches,
    tournamentId,
    champCfg
  );
  const pairsWithStats = computePairsWithStats(pairs, standingsMatches, games);
  const sorted = sortPairsForStandings(
    pairsWithStats,
    standingsMatches,
    games
  );
  const statsById = new Map(pairsWithStats.map((p) => [p.id, p]));

  let winnerPair: Pair | null = sorted[0] ?? null;

  if (champCfg?.championshipEnabled) {
    const podium = await resolveChampionshipPodium(
      pairs,
      matches,
      champCfg,
      games
    );
    if (podium?.first) {
      winnerPair = podium.first;
    }
  }

  return {
    winner: winnerPair
      ? pairToTournamentWinner(winnerPair, statsById.get(winnerPair.id))
      : null,
    secondPair: sorted[1] ?? null,
    thirdPair: sorted[2] ?? null,
  };
}
