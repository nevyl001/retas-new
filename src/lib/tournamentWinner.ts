import type { Pair } from "./database";
import type { PublicEliminatoriaPodiumStats } from "./torneoExpress/publicEliminatoriaPodiumStats";

/** Resultado de ganador para pantallas de celebración (público y organizador). */
export interface TournamentWinner {
  pair: Pair;
  totalPoints: number;
  totalPointsReceived: number;
  totalSets: number;
  totalGames: number;
  matchesPlayed: number;
  winPercentage: number;
  victorias: number;
  derrotas: number;
  difJuegos: number;
}

export function tournamentWinnerToPodiumStats(
  winner: TournamentWinner
): PublicEliminatoriaPodiumStats {
  return {
    partidos: winner.matchesPlayed,
    victorias: winner.victorias,
    derrotas: winner.derrotas,
    juegosFavor: winner.totalPoints,
    juegosContra: winner.totalPointsReceived,
    dif: winner.difJuegos,
  };
}
