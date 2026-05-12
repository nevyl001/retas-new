import type { AmericanoMatch, AmericanoPlayer } from "./db/types";

export function applyAmericanoResult(
  match: AmericanoMatch,
  scoreA: number,
  scoreB: number
): void {
  match.scoreA = scoreA;
  match.scoreB = scoreB;

  match.teamA.forEach((player) => {
    player.stats.pointsFor += scoreA;
    player.stats.pointsAgainst += scoreB;
    player.stats.gamesPlayed += 1;
  });

  match.teamB.forEach((player) => {
    player.stats.pointsFor += scoreB;
    player.stats.pointsAgainst += scoreA;
    player.stats.gamesPlayed += 1;
  });
}

/** Clasificación por games acumulados (pointsFor = games ganados por el jugador en su equipo). */
export function getAmericanoRanking(
  players: AmericanoPlayer[]
): AmericanoPlayer[] {
  return [...players].sort((a, b) => {
    if (b.stats.pointsFor !== a.stats.pointsFor) {
      return b.stats.pointsFor - a.stats.pointsFor;
    }
    const diffA = a.stats.pointsFor - a.stats.pointsAgainst;
    const diffB = b.stats.pointsFor - b.stats.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return a.name.localeCompare(b.name);
  });
}
