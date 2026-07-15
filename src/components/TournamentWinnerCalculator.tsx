import { Pair, Match, Game } from "../lib/database";
import { getGames } from "../lib/database";
import type { TournamentWinner } from "../lib/tournamentWinner";
import { computeStandingDif } from "../utils/standingsDisplay";
import { debugLog } from "../lib/debug/debugLog";

export type { TournamentWinner };

export class TournamentWinnerCalculator {
  /**
   * Calcula el ganador de la reta basado en criterios específicos
   */
  static async calculateTournamentWinner(
    pairs: Pair[],
    matches: Match[]
  ): Promise<TournamentWinner | null> {
    try {
      // Obtener todos los juegos de todos los partidos
      const allGames: Game[] = [];
      for (const match of matches) {
        if (match.status === "finished") {
          const matchGames = await getGames(match.id);
          allGames.push(...matchGames);
        }
      }

      // Calcular estadísticas acumuladas para cada pareja
      const pairStats = new Map<
        string,
        {
          totalPoints: number;
          totalPointsReceived: number;
          totalSets: number;
          totalGames: number;
          matchesPlayed: number;
          wins: number;
          losses: number;
        }
      >();

      // Inicializar estadísticas
      for (const pair of pairs) {
        pairStats.set(pair.id, {
          totalPoints: 0,
          totalPointsReceived: 0,
          totalSets: 0,
          totalGames: 0,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
        });
      }

      // Procesar cada partido finalizado
      for (const match of matches) {
        if (match.status === "finished") {
          const matchGames = allGames.filter((g) => g.match_id === match.id);

          if (matchGames.length > 0) {
            // Calcular estadísticas del partido
            const matchStats = this.calculateMatchStats(matchGames);

            // Acumular para pareja 1
            const pair1Stats = pairStats.get(match.pair1_id)!;
            pair1Stats.totalPoints += matchStats.pair1Points;
            pair1Stats.totalPointsReceived += matchStats.pair2Points;
            pair1Stats.totalSets += matchStats.pair1Sets;
            pair1Stats.totalGames += matchStats.pair1Games;
            pair1Stats.matchesPlayed += 1;
            if (matchStats.pair1Points > matchStats.pair2Points) {
              pair1Stats.wins += 1;
            } else if (matchStats.pair2Points > matchStats.pair1Points) {
              pair1Stats.losses += 1;
            }

            // Acumular para pareja 2
            const pair2Stats = pairStats.get(match.pair2_id)!;
            pair2Stats.totalPoints += matchStats.pair2Points;
            pair2Stats.totalPointsReceived += matchStats.pair1Points;
            pair2Stats.totalSets += matchStats.pair2Sets;
            pair2Stats.totalGames += matchStats.pair2Games;
            pair2Stats.matchesPlayed += 1;
            if (matchStats.pair2Points > matchStats.pair1Points) {
              pair2Stats.wins += 1;
            } else if (matchStats.pair1Points > matchStats.pair2Points) {
              pair2Stats.losses += 1;
            }
          }
        }
      }

      // Crear array de candidatos al ganador
      const candidates: TournamentWinner[] = [];

      for (const pair of pairs) {
        const stats = pairStats.get(pair.id);
        if (stats && stats.matchesPlayed > 0) {
          const winPercentage = (stats.wins / stats.matchesPlayed) * 100;

          candidates.push({
            pair,
            totalPoints: stats.totalPoints,
            totalPointsReceived: stats.totalPointsReceived,
            totalSets: stats.totalSets,
            totalGames: stats.totalGames,
            matchesPlayed: stats.matchesPlayed,
            winPercentage,
            victorias: stats.wins,
            derrotas: stats.losses,
            difJuegos: computeStandingDif(
              stats.totalPoints,
              stats.totalPointsReceived
            ),
          });
        }
      }

      // Ordenar candidatos por criterios
      candidates.sort((a, b) => {
        // Criterio 1: Puntos totales (descendente) - CRITERIO PRINCIPAL
        if (a.totalPoints !== b.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }

        // Criterio 2: Sets ganados (descendente) - CRITERIO DE DESEMPATE
        if (a.totalSets !== b.totalSets) {
          return b.totalSets - a.totalSets;
        }

        // Criterio 3: Juegos ganados (descendente)
        if (a.totalGames !== b.totalGames) {
          return b.totalGames - a.totalGames;
        }

        // Criterio 4: Porcentaje de victorias (descendente)
        if (a.winPercentage !== b.winPercentage) {
          return b.winPercentage - a.winPercentage;
        }

        // Criterio 5: Menos partidos jugados (mejor eficiencia)
        return a.matchesPlayed - b.matchesPlayed;
      });

      const winner = candidates.length > 0 ? candidates[0] : null;

      debugLog(
        "[tournament-winner]",
        winner
          ? {
              ganador: `${winner.pair.player1?.name} / ${winner.pair.player2?.name}`,
              puntos: winner.totalPoints,
              sets: winner.totalSets,
              juegos: winner.totalGames,
              partidos: winner.matchesPlayed,
              pctVictorias: Number(winner.winPercentage.toFixed(1)),
            }
          : "sin ganador (sin partidos finalizados)"
      );
      return winner;
    } catch (error) {
      console.error("❌ Error al calcular ganador de la reta:", error);
      return null;
    }
  }

  /**
   * Calcula las estadísticas de un partido basado en sus juegos
   */
  private static calculateMatchStats(games: Game[]): {
    pair1Points: number;
    pair2Points: number;
    pair1Sets: number;
    pair2Sets: number;
    pair1Games: number;
    pair2Games: number;
  } {
    let pair1Points = 0;
    let pair2Points = 0;
    let pair1Sets = 0;
    let pair2Sets = 0;
    let pair1Games = 0;
    let pair2Games = 0;

    for (const game of games) {
      const pair1GamePoints = game.pair1_games;
      const pair2GamePoints = game.pair2_games;

      // Sumar puntos del juego
      pair1Points += pair1GamePoints;
      pair2Points += pair2GamePoints;

      // Determinar ganador del juego
      if (pair1GamePoints > pair2GamePoints) {
        pair1Games += 1;
        // Si llegó a 6 puntos, gana un set
        if (pair1GamePoints >= 6) {
          pair1Sets += 1;
        }
      } else if (pair2GamePoints > pair1GamePoints) {
        pair2Games += 1;
        // Si llegó a 6 puntos, gana un set
        if (pair2GamePoints >= 6) {
          pair2Sets += 1;
        }
      }
      // Si es empate, no se suma juego ni set
    }

    return {
      pair1Points,
      pair2Points,
      pair1Sets,
      pair2Sets,
      pair1Games,
      pair2Games,
    };
  }
}
