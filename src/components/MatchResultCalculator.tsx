import { Game, Match, Pair } from "../lib/database";
import { updatePair, getPairs, getMatches, getGames } from "../lib/database";

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
    console.log("🎯 === CÁLCULO DE ESTADÍSTICAS DEL PARTIDO ===");
    console.log("🎯 Partido ID:", match.id);
    console.log("🎯 Total de juegos:", games.length);

    let pair1GamesWon = 0;
    let pair2GamesWon = 0;
    let pair1TotalPoints = 0;
    let pair2TotalPoints = 0;
    let pair1SetsWon = 0;
    let pair2SetsWon = 0;

    // Procesar cada juego del partido
    games.forEach((game, index) => {
      console.log(`📊 === JUEGO ${index + 1} ===`);
      console.log("📊 Datos del juego:", {
        pair1_games: game.pair1_games,
        pair2_games: game.pair2_games,
        is_tie_break: game.is_tie_break,
        tie_break_pair1: game.tie_break_pair1_points,
        tie_break_pair2: game.tie_break_pair2_points,
      });

      if (game.is_tie_break) {
        console.log("📊 Es un tie-break");
        // Para tie-breaks
        if (game.tie_break_pair1_points > game.tie_break_pair2_points) {
          pair1GamesWon++;
          console.log(
            `✅ Pareja 1 gana tie-break: ${game.tie_break_pair1_points}-${game.tie_break_pair2_points}`
          );
        } else if (game.tie_break_pair2_points > game.tie_break_pair1_points) {
          pair2GamesWon++;
          console.log(
            `✅ Pareja 2 gana tie-break: ${game.tie_break_pair1_points}-${game.tie_break_pair2_points}`
          );
        } else {
          console.log(
            `🤝 Empate en tie-break: ${game.tie_break_pair1_points}-${game.tie_break_pair2_points}`
          );
        }
        pair1TotalPoints += game.tie_break_pair1_points || 0;
        pair2TotalPoints += game.tie_break_pair2_points || 0;
      } else {
        console.log("📊 Es un juego normal");
        console.log(
          `📊 Puntos Pareja 1: ${game.pair1_games}, Puntos Pareja 2: ${game.pair2_games}`
        );

        // Para juegos normales
        if (game.pair1_games > game.pair2_games) {
          pair1GamesWon++;
          console.log(
            `✅ Pareja 1 gana juego: ${game.pair1_games}-${game.pair2_games}`
          );
        } else if (game.pair2_games > game.pair1_games) {
          pair2GamesWon++;
          console.log(
            `✅ Pareja 2 gana juego: ${game.pair1_games}-${game.pair2_games}`
          );
        } else {
          console.log(
            `🤝 Empate en juego: ${game.pair1_games}-${game.pair2_games}`
          );
        }
        pair1TotalPoints += game.pair1_games;
        pair2TotalPoints += game.pair2_games;
      }

      // Verificar si alguna pareja llegó a 6 puntos en este juego (gana 1 set)
      if (!game.is_tie_break) {
        if (game.pair1_games >= 6) {
          pair1SetsWon++;
          console.log(
            `🏆 Pareja 1 gana 1 SET en juego ${index + 1} con ${
              game.pair1_games
            } puntos`
          );
        }
        if (game.pair2_games >= 6) {
          pair2SetsWon++;
          console.log(
            `🏆 Pareja 2 gana 1 SET en juego ${index + 1} con ${
              game.pair2_games
            } puntos`
          );
        }
      }

      console.log(
        `📊 Después del juego ${
          index + 1
        }: Pareja 1 = ${pair1GamesWon} juegos, Pareja 2 = ${pair2GamesWon} juegos`
      );
    });

    console.log("🔍 === RESULTADO FINAL DEL PARTIDO ===");
    console.log(
      `🔍 Juegos: Pareja 1 = ${pair1GamesWon}, Pareja 2 = ${pair2GamesWon}`
    );
    console.log(
      `🔍 Sets: Pareja 1 = ${pair1SetsWon}, Pareja 2 = ${pair2SetsWon}`
    );
    console.log(
      `🔍 Puntos totales: Pareja 1 = ${pair1TotalPoints}, Pareja 2 = ${pair2TotalPoints}`
    );

    // Determinar si es empate (cuando los puntos totales son iguales)
    const isTie = pair1TotalPoints === pair2TotalPoints;
    console.log(
      `🔍 Es empate: ${isTie} (${pair1TotalPoints}-${pair2TotalPoints} puntos totales)`
    );

    console.log("🎯 === FIN CÁLCULO DEL PARTIDO ===");

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
      console.log("🔄 === RECÁLCULO DE ESTADÍSTICAS DEL PARTIDO ===");
      console.log("🔄 SOLO recálculo - NO acumula estadísticas");

      const stats = this.calculateMatchStatistics(match, games);
      const pair1 = pairs.find((p) => p.id === match.pair1_id);
      const pair2 = pairs.find((p) => p.id === match.pair2_id);

      console.log("📊 Estadísticas recalculadas del partido:", {
        pair1GamesWon: stats.pair1GamesWon,
        pair2GamesWon: stats.pair2GamesWon,
        pair1SetsWon: stats.pair1SetsWon,
        pair2SetsWon: stats.pair2SetsWon,
        isTie: stats.isTie,
      });

      // NO actualizar estadísticas en la base de datos
      // Solo calcular para mostrar en la interfaz
      console.log(
        "✅ Solo recálculo completado - NO se actualizaron estadísticas"
      );

      // Determinar ganador del partido
      let winnerId: string | undefined;

      console.log("🏆 === DETERMINACIÓN DEL GANADOR DEL PARTIDO ===");
      console.log(
        `🏆 Sets: Pareja 1 = ${stats.pair1SetsWon}, Pareja 2 = ${stats.pair2SetsWon}`
      );
      console.log(
        `🏆 Juegos: Pareja 1 = ${stats.pair1GamesWon}, Pareja 2 = ${stats.pair2GamesWon}`
      );
      console.log(`🏆 Es empate: ${stats.isTie}`);

      if (stats.isTie) {
        winnerId = undefined;
        console.log("🤝 Partido terminó en EMPATE por puntos totales");
      } else if (stats.pair1TotalPoints > stats.pair2TotalPoints) {
        winnerId = match.pair1_id;
        console.log("🏆 Pareja 1 gana por puntos totales");
      } else if (stats.pair2TotalPoints > stats.pair1TotalPoints) {
        winnerId = match.pair2_id;
        console.log("🏆 Pareja 2 gana por puntos totales");
      } else {
        winnerId = undefined;
        console.log("❌ Caso inesperado en determinación del ganador");
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

      console.log("🔄 === FIN RECÁLCULO DEL PARTIDO ===");

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
      console.log("🏆 === ACUMULACIÓN DE ESTADÍSTICAS DEL PARTIDO ===");
      console.log("🏆 ACUMULANDO estadísticas al finalizar partido");

      const stats = this.calculateMatchStatistics(match, games);
      const pair1 = pairs.find((p) => p.id === match.pair1_id);
      const pair2 = pairs.find((p) => p.id === match.pair2_id);

      console.log("📊 Estadísticas del partido a acumular:", {
        pair1GamesWon: stats.pair1GamesWon,
        pair2GamesWon: stats.pair2GamesWon,
        pair1SetsWon: stats.pair1SetsWon,
        pair2SetsWon: stats.pair2SetsWon,
        isTie: stats.isTie,
      });

      // ACUMULAR estadísticas en la base de datos
      if (pair1) {
        console.log(
          `📊 Acumulando Pareja 1: ${pair1.player1?.name} / ${pair1.player2?.name}`
        );
        console.log(
          `📊 Estadísticas actuales: ${pair1.games_won} juegos, ${pair1.sets_won} sets, ${pair1.points} puntos, ${pair1.matches_played} partidos`
        );
        console.log(
          `📊 Estadísticas del partido: ${stats.pair1GamesWon} juegos, ${stats.pair1SetsWon} sets, ${stats.pair1TotalPoints} puntos`
        );

        await updatePair(pair1.id, {
          games_won: pair1.games_won + stats.pair1GamesWon,
          sets_won: pair1.sets_won + stats.pair1SetsWon,
          points: pair1.points + stats.pair1TotalPoints,
          matches_played: pair1.matches_played + 1,
        });

        console.log(
          `✅ Pareja 1 acumulada: ${
            pair1.games_won + stats.pair1GamesWon
          } juegos, ${pair1.sets_won + stats.pair1SetsWon} sets, ${
            pair1.points + stats.pair1TotalPoints
          } puntos, ${pair1.matches_played + 1} partidos`
        );
      }

      if (pair2) {
        console.log(
          `📊 Acumulando Pareja 2: ${pair2.player1?.name} / ${pair2.player2?.name}`
        );
        console.log(
          `📊 Estadísticas actuales: ${pair2.games_won} juegos, ${pair2.sets_won} sets, ${pair2.points} puntos, ${pair2.matches_played} partidos`
        );
        console.log(
          `📊 Estadísticas del partido: ${stats.pair2GamesWon} juegos, ${stats.pair2SetsWon} sets, ${stats.pair2TotalPoints} puntos`
        );

        await updatePair(pair2.id, {
          games_won: pair2.games_won + stats.pair2GamesWon,
          sets_won: pair2.sets_won + stats.pair2SetsWon,
          points: pair2.points + stats.pair2TotalPoints,
          matches_played: pair2.matches_played + 1,
        });

        console.log(
          `✅ Pareja 2 acumulada: ${
            pair2.games_won + stats.pair2GamesWon
          } juegos, ${pair2.sets_won + stats.pair2SetsWon} sets, ${
            pair2.points + stats.pair2TotalPoints
          } puntos, ${pair2.matches_played + 1} partidos`
        );
      }

      // Determinar ganador
      let winnerId: string | undefined;

      console.log("🏆 === DETERMINACIÓN DEL GANADOR ===");
      console.log(
        `🏆 Sets: Pareja 1 = ${stats.pair1SetsWon}, Pareja 2 = ${stats.pair2SetsWon}`
      );
      console.log(
        `🏆 Juegos: Pareja 1 = ${stats.pair1GamesWon}, Pareja 2 = ${stats.pair2GamesWon}`
      );
      console.log(`🏆 Es empate: ${stats.isTie}`);

      if (stats.isTie) {
        winnerId = undefined;
        console.log("🤝 Partido terminó en EMPATE por puntos totales");
      } else if (stats.pair1TotalPoints > stats.pair2TotalPoints) {
        winnerId = match.pair1_id;
        console.log("🏆 Pareja 1 gana por puntos totales");
      } else if (stats.pair2TotalPoints > stats.pair1TotalPoints) {
        winnerId = match.pair2_id;
        console.log("🏆 Pareja 2 gana por puntos totales");
      } else {
        winnerId = undefined;
        console.log("❌ Caso inesperado en determinación del ganador");
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

      console.log("🏆 === FIN ACUMULACIÓN DEL PARTIDO ===");

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
      console.log("🔄 === INICIO RECÁLCULO COMPLETO ===");

      // Obtener todos los datos de la reta
      const pairs = await getPairs(tournamentId);
      const matches = await getMatches(tournamentId);

      // Resetear todas las estadísticas de las parejas
      console.log("🔄 Reseteando estadísticas de todas las parejas...");
      for (const pair of pairs) {
        await updatePair(pair.id, {
          games_won: 0,
          sets_won: 0,
          points: 0,
          matches_played: 0,
        });
      }

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
        if (match.is_finished) {
          console.log(`🔄 Procesando partido finalizado: ${match.id}`);
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

      // Actualizar todas las parejas con sus estadísticas acumuladas
      console.log("🔄 Actualizando estadísticas acumuladas...");
      for (const pair of pairs) {
        const stats = pairStats.get(pair.id);
        if (stats) {
          await updatePair(pair.id, {
            games_won: stats.gamesWon,
            sets_won: stats.setsWon,
            points: stats.points,
            matches_played: stats.matchesPlayed,
          });
          console.log(
            `📊 Pareja ${pair.id}: ${stats.points} puntos, ${stats.setsWon} sets, ${stats.gamesWon} juegos, ${stats.matchesPlayed} partidos`
          );
        }
      }

      console.log(
        `✅ Estadísticas recalculadas para ${processedMatches} partidos`
      );
      console.log("🔄 === FIN RECÁLCULO COMPLETO ===");

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
      // Criterio 1: Puntos totales (descendente) - CRITERIO PRINCIPAL
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      // Criterio 2: Sets ganados (descendente) - CRITERIO DE DESEMPATE
      if (a.sets_won !== b.sets_won) {
        return b.sets_won - a.sets_won;
      }
      // Criterio 3: Juegos ganados (descendente)
      if (a.games_won !== b.games_won) {
        return b.games_won - a.games_won;
      }
      // Criterio 4: Menos partidos jugados (mejor eficiencia)
      return a.matches_played - b.matches_played;
    });
  }
}
