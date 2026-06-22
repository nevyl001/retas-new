import type { Pair } from "./database";

/** Resultado de ganador para pantallas de celebración (público y organizador). */
export interface TournamentWinner {
  pair: Pair;
  totalPoints: number;
  totalSets: number;
  totalGames: number;
  matchesPlayed: number;
  winPercentage: number;
}
