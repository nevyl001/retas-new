import type { Game, Match } from "../db/types";
import { getGames } from "../database";

export async function loadGamesByMatchId(
  finishedMatches: Match[],
  getGamesFn: (matchId: string) => Promise<Game[]> = getGames
): Promise<{ gamesByMatchId: Map<string, Game[]>; allGames: Game[] }> {
  const gamesByMatchId = new Map<string, Game[]>();
  const allGames: Game[] = [];

  for (const m of finishedMatches) {
    try {
      const g = await getGamesFn(m.id);
      gamesByMatchId.set(m.id, g);
      allGames.push(...g);
    } catch {
      gamesByMatchId.set(m.id, []);
    }
  }

  return { gamesByMatchId, allGames };
}
