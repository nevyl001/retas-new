import { Game, Match, Pair } from "../lib/database";
import { getPairs, getMatches, getGames } from "../lib/database";
import { debugLog } from "../lib/debug/debugLog";

export interface MatchResult {
  success: boolean;
  message: string;
  pair1Stats: {
    gamesWon: number;
    setsWon: number;
    points: number;
  };
  pair2Stats: {
    gamesWon: number;
    setsWon: number;
    points: number;
  };
  winnerId?: string;
  isTie: boolean;
}

export class MatchResultCalculator {
  /**
   * Calcula estadísticas de un partido específico
   */
  static calculateMatchStatistics(
    match: Match,
    games: Game[]
  ): {
    pair1GamesWon: number;
    pair2GamesWon: number;
    pair1SetsWon: number;
    pair2SetsWon: number;
    pair1TotalPoints: number;
    pair2TotalPoints: number;
    isTie: boolean;
  } {
    let pair1GamesWon = 0;
    let pair2GamesWon = 0;
    let pair1TotalPoints = 0;
    let pair2TotalPoints = 0;
    let pair1SetsWon = 0;
    let pair2SetsWon = 0;

    // Procesar cada juego del partido
    games.forEach((game) => {
      if (game.is_tie_break) {
        // Para tie-breaks
        if (game.tie_break_pair1_points > game.tie_break_pair2_points) {
          pair1GamesWon++;
        } else if (game.tie_break_pair2_points > game.tie_break_pair1_points) {
          pair2GamesWon++;
        }
        pair1TotalPoints += game.tie_break_pair1_points || 0;
        pair2TotalPoints += game.tie_break_pair2_points || 0;
      } else {
        // Para juegos normales
        if (game.pair1_games > game.pair2_games) {
          pair1GamesWon++;
        } else if (game.pair2_games > game.pair1_games) {
          pair2GamesWon++;
        }
        pair1TotalPoints += game.pair1_games;
        pair2TotalPoints += game.pair2_games;
      }

      // Verificar si alguna pareja llegó a 6 puntos en este juego (gana 1 set)
      if (!game.is_tie_break) {
        if (game.pair1_games >= 6) {
          pair1SetsWon++;
        }
        if (game.pair2_games >= 6) {
          pair2SetsWon++;
        }
      }
    });

    // Determinar si es empate (cuando los puntos totales son iguales)
    const isTie = pair1TotalPoints === pair2TotalPoints;

    debugLog("[match-result] estadísticas del partido:", {
      matchId: match.id,
      juegos: { pair1: pair1GamesWon, pair2: pair2GamesWon },
      sets: { pair1: pair1SetsWon, pair2: pair2SetsWon },
      puntos: { pair1: pair1TotalPoints, pair2: pair2TotalPoints },
      isTie,
    });

    return {
      pair1GamesWon,
      pair2GamesWon,
      pair1SetsWon,
      pair2SetsWon,
      pair1TotalPoints,
      pair2TotalPoints,
      isTie,
    };
  }

  /**
   * SOLO recalcula estadísticas del partido (sin acumular)
   * Se usa cuando se corrige un juego
   */
  static async recalculateMatchStatistics(
    match: Match,
    games: Game[],
    pairs: Pair[]
  ): Promise<MatchResult> {
    try {
      const stats = this.calculateMatchStatistics(match, games);
      const pair1 = pairs.find((p) => p.id === match.pair1_id);
      const pair2 = pairs.find((p) => p.id === match.pair2_id);

      // Determinar ganador del partido (NO se actualiza la base de datos aquí,
      // solo se calcula para mostrar en la interfaz).
      let winnerId: string | undefined;

      if (stats.isTie) {
        winnerId = undefined;
      } else if (stats.pair1TotalPoints > stats.pair2TotalPoints) {
        winnerId = match.pair1_id;
      } else if (stats.pair2TotalPoints > stats.pair1TotalPoints) {
        winnerId = match.pair2_id;
      } else {
        winnerId = undefined;
      }

      let message: string;
      if (stats.isTie) {
        message = `✅ Partido recalculado.\n\n🤝 EMPATE (${stats.pair1TotalPoints}-${stats.pair2TotalPoints} puntos totales)`;
      } else if (winnerId) {
        const winnerName =
          winnerId === match.pair1_id
            ? `${pair1?.player1?.name} / ${pair1?.player2?.name}`
            : `${pair2?.player1?.name} / ${pair2?.player2?.name}`;
        message = `✅ Partido recalculado.\n\n🏆 Ganador: ${winnerName} (${stats.pair1TotalPoints}-${stats.pair2TotalPoints} puntos totales)`;
      } else {
        message = `✅ Partido recalculado.\n\n🤝 Empate (${stats.pair1TotalPoints}-${stats.pair2TotalPoints} puntos totales)`;
      }

      return {
        success: true,
        message,
        pair1Stats: {
          gamesWon: stats.pair1GamesWon,
          setsWon: stats.pair1SetsWon,
          points: stats.pair1TotalPoints,
        },
        pair2Stats: {
          gamesWon: stats.pair2GamesWon,
          setsWon: stats.pair2SetsWon,
          points: stats.pair2TotalPoints,
        },
        winnerId,
        isTie: stats.isTie,
      };
    } catch (error) {
      console.error("❌ Error en recalculateMatchStatistics:", error);
      return {
        success: false,
        message: "Error al recalcular estadísticas del partido",
        pair1Stats: { gamesWon: 0, setsWon: 0, points: 0 },
        pair2Stats: { gamesWon: 0, setsWon: 0, points: 0 },
        isTie: false,
      };
    }
  }

  /**
   * ACUMULA estadísticas del partido a las estadísticas totales
   * Se usa SOLO cuando se finaliza el partido
   */
  static async accumulateMatchStatistics(
    match: Match,
    games: Game[],
    pairs: Pair[]
  ): Promise<MatchResult> {
    try {
      const stats = this.calculateMatchStatistics(match, games);
      const pair1 = pairs.find((p) => p.id === match.pair1_id);
      const pair2 = pairs.find((p) => p.id === match.pair2_id);

      // Determinar ganador (estadísticas ya calculadas arriba; no se guardan
      // en base de datos en este paso, solo se resuelve el mensaje final).
      let winnerId: string | undefined;

      if (stats.isTie) {
        winnerId = undefined;
      } else if (stats.pair1TotalPoints > stats.pair2TotalPoints) {
        winnerId = match.pair1_id;
      } else if (stats.pair2TotalPoints > stats.pair1TotalPoints) {
        winnerId = match.pair2_id;
      } else {
        winnerId = undefined;
      }

      let message: string;
      if (stats.isTie) {
        message = `✅ Partido finalizado.\n\n🤝 EMPATE (${stats.pair1TotalPoints}-${stats.pair2TotalPoints} puntos totales)`;
      } else if (winnerId) {
        const winnerName =
          winnerId === match.pair1_id
            ? `${pair1?.player1?.name} / ${pair1?.player2?.name}`
            : `${pair2?.player1?.name} / ${pair2?.player2?.name}`;
        message = `✅ Partido finalizado.\n\n🏆 Ganador: ${winnerName} (${stats.pair1TotalPoints}-${stats.pair2TotalPoints} puntos totales)`;
      } else {
        message = `✅ Partido finalizado.\n\n🤝 Empate (${stats.pair1TotalPoints}-${stats.pair2TotalPoints} puntos totales)`;
      }

      return {
        success: true,
        message,
        pair1Stats: {
          gamesWon: stats.pair1GamesWon,
          setsWon: stats.pair1SetsWon,
          points: stats.pair1TotalPoints,
        },
        pair2Stats: {
          gamesWon: stats.pair2GamesWon,
          setsWon: stats.pair2SetsWon,
          points: stats.pair2TotalPoints,
        },
        winnerId,
        isTie: stats.isTie,
      };
    } catch (error) {
      console.error("❌ Error en accumulateMatchStatistics:", error);
      return {
        success: false,
        message: "Error al acumular estadísticas del partido",
        pair1Stats: { gamesWon: 0, setsWon: 0, points: 0 },
        pair2Stats: { gamesWon: 0, setsWon: 0, points: 0 },
        isTie: false,
      };
    }
  }

  /**
   * Recalcula todas las estadísticas de la reta
   */
  static async recalculateAllStatistics(tournamentId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Obtener todos los datos de la reta
      const pairs = await getPairs(tournamentId);
      const matches = await getMatches(tournamentId);

      // Crear un mapa para acumular estadísticas de cada pareja
      const pairStats = new Map<
        string,
        {
          gamesWon: number;
          setsWon: number;
          points: number;
          matchesPlayed: number;
        }
      >();

      // Inicializar estadísticas para todas las parejas
      for (const pair of pairs) {
        pairStats.set(pair.id, {
          gamesWon: 0,
          setsWon: 0,
          points: 0,
          matchesPlayed: 0,
        });
      }

      // Procesar cada partido finalizado y acumular estadísticas
      let processedMatches = 0;
      for (const match of matches) {
        if (match.status === "finished") {
          const games = await getGames(match.id);

          if (games.length > 0) {
            const stats = this.calculateMatchStatistics(match, games);

            // Acumular estadísticas para pareja 1
            const pair1Stats = pairStats.get(match.pair1_id)!;
            pair1Stats.gamesWon += stats.pair1GamesWon;
            pair1Stats.setsWon += stats.pair1SetsWon;
            pair1Stats.points += stats.pair1TotalPoints;
            pair1Stats.matchesPlayed += 1;

            // Acumular estadísticas para pareja 2
            const pair2Stats = pairStats.get(match.pair2_id)!;
            pair2Stats.gamesWon += stats.pair2GamesWon;
            pair2Stats.setsWon += stats.pair2SetsWon;
            pair2Stats.points += stats.pair2TotalPoints;
            pair2Stats.matchesPlayed += 1;

            processedMatches++;
          }
        }
      }

      debugLog(
        `[match-result] estadísticas recalculadas para ${processedMatches} partido(s), ${pairs.length} pareja(s)`
      );

      return {
        success: true,
        message: `✅ Estadísticas recalculadas exitosamente para ${processedMatches} partidos`,
      };
    } catch (error) {
      console.error("❌ Error en recalculateAllStatistics:", error);
      return {
        success: false,
        message: "Error al recalcular estadísticas de la reta",
      };
    }
  }

  /**
   * Calcula el ranking de las parejas
   */
  static calculateRanking(pairs: Pair[]): Pair[] {
    return [...pairs].sort((a, b) => {
      // Ordenar por nombre de pareja (alfabético) ya que no tenemos estadísticas
      const nameA = `${a.player1_name}/${a.player2_name}`;
      const nameB = `${b.player1_name}/${b.player2_name}`;
      return nameA.localeCompare(nameB);
    });
  }
}
