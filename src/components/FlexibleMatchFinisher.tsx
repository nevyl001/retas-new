import { Game, Match, Pair } from "../lib/database";
import { updateMatch } from "../lib/database";

export interface FlexibleMatchResult {
  success: boolean;
  message: string;
  isTie: boolean;
  winnerId?: string;
  pair1Games: number;
  pair2Games: number;
  pair1TotalPoints: number;
  pair2TotalPoints: number;
}

export class FlexibleMatchFinisher {
  /**
   * Finaliza un partido con lógica simple que suma juegos tal como están
   */
  static async finishMatch(
    match: Match,
    games: Game[],
    pairs: Pair[],
    onUpdate: () => void
  ): Promise<FlexibleMatchResult> {
    console.log("=== FINALIZANDO PARTIDO CON FLEXIBLEMATCHFINISHER ===");
    console.log("Match:", match.id);
    console.log("Games:", games.length);

    try {
      // Validar que hay juegos
      if (games.length === 0) {
        return {
          success: false,
          message: "No se puede finalizar un partido sin juegos",
          isTie: false,
          pair1Games: 0,
          pair2Games: 0,
          pair1TotalPoints: 0,
          pair2TotalPoints: 0,
        };
      }

      // Calcular juegos ganados por cada pareja - LÓGICA SIMPLE
      let pair1Games = 0;
      let pair2Games = 0;
      let pair1TotalPoints = 0;
      let pair2TotalPoints = 0;

      games.forEach((game, index) => {
        console.log(`Analizando Juego ${index + 1}:`, {
          pair1_games: game.pair1_games,
          pair2_games: game.pair2_games,
          is_tie_break: game.is_tie_break,
          tie_break_pair1: game.tie_break_pair1_points,
          tie_break_pair2: game.tie_break_pair2_points,
        });

        if (game.is_tie_break) {
          // Para tie-breaks - LÓGICA SIMPLE
          if (
            game.tie_break_pair1_points >= 10 &&
            game.tie_break_pair1_points - game.tie_break_pair2_points >= 2
          ) {
            pair1Games++;
            console.log("Tie-break ganado por pareja 1");
          } else if (
            game.tie_break_pair2_points >= 10 &&
            game.tie_break_pair2_points - game.tie_break_pair1_points >= 2
          ) {
            pair2Games++;
            console.log("Tie-break ganado por pareja 2");
          } else {
            // EMPATE EN TIE-BREAK - AMBAS PAREJAS GANAN 1 JUEGO
            pair1Games++;
            pair2Games++;
            console.log("Tie-break empatado - ambas parejas ganan 1 juego");
          }
          pair1TotalPoints += game.tie_break_pair1_points;
          pair2TotalPoints += game.tie_break_pair2_points;
        } else {
          // Para juegos normales - LÓGICA SIMPLE
          if (game.pair1_games > game.pair2_games) {
            pair1Games++;
            console.log("Juego normal ganado por pareja 1");
          } else if (game.pair2_games > game.pair1_games) {
            pair2Games++;
            console.log("Juego normal ganado por pareja 2");
          } else {
            // EMPATE EN JUEGO - AMBAS PAREJAS GANAN 1 JUEGO
            pair1Games++;
            pair2Games++;
            console.log("Juego normal empatado - ambas parejas ganan 1 juego");
          }
          pair1TotalPoints += game.pair1_games;
          pair2TotalPoints += game.pair2_games;
        }
      });

      console.log("Resultado calculado:", {
        pair1Games,
        pair2Games,
        pair1TotalPoints,
        pair2TotalPoints,
      });

      // Determinar si es empate (incluyendo empates parciales)
      const isTie = pair1Games === pair2Games;
      const winnerId = isTie
        ? undefined
        : pair1Games > pair2Games
        ? match.pair1_id
        : match.pair2_id;

      console.log("Decisión final:", {
        isTie,
        winnerId,
        pair1Games,
        pair2Games,
      });

      // Actualizar el partido en la base de datos
      await updateMatch(match.id, {
        winner_id: winnerId,
        is_finished: true,
      });

      console.log("✅ Partido actualizado en base de datos");

      // Usar los valores calculados directamente
      const finalPair1Games = pair1Games;
      const finalPair2Games = pair2Games;
      const finalIsTie = isTie;
      const finalWinnerId = winnerId;

      // Notificar al componente padre para actualizar la tabla automáticamente
      onUpdate();

      // Generar mensaje de éxito
      const message = `✅ Partido finalizado exitosamente.\n\n📊 Resultado: ${finalPair1Games}-${finalPair2Games} juegos`;

      return {
        success: true,
        message,
        isTie: finalIsTie,
        winnerId: finalWinnerId,
        pair1Games: finalPair1Games,
        pair2Games: finalPair2Games,
        pair1TotalPoints: pair1TotalPoints,
        pair2TotalPoints: pair2TotalPoints,
      };
    } catch (error) {
      console.error("❌ Error finalizando partido:", error);
      return {
        success: false,
        message: `Error al finalizar el partido: ${error}`,
        isTie: false,
        pair1Games: 0,
        pair2Games: 0,
        pair1TotalPoints: 0,
        pair2TotalPoints: 0,
      };
    }
  }

  /**
   * Valida si se puede finalizar un partido (lógica ultra permisiva)
   */
  static canFinishMatch(games: Game[]): boolean {
    if (games.length === 0) {
      return false;
    }

    // Verificar que todos los juegos tengan marcadores válidos (permitir 0)
    for (const game of games) {
      if (game.is_tie_break) {
        if (
          game.tie_break_pair1_points < 0 ||
          game.tie_break_pair2_points < 0
        ) {
          return false;
        }
      } else {
        if (game.pair1_games < 0 || game.pair2_games < 0) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calcula el estado actual del partido para mostrar
   */
  static calculateMatchStatus(
    match: Match,
    games: Game[],
    pairs: Pair[]
  ): {
    pair1Games: number;
    pair2Games: number;
    isTie: boolean;
    winnerId?: string;
    canFinish: boolean;
    reason: string;
  } {
    if (games.length === 0) {
      return {
        pair1Games: 0,
        pair2Games: 0,
        isTie: false,
        canFinish: false,
        reason: "No hay juegos registrados",
      };
    }

    let pair1Games = 0;
    let pair2Games = 0;

    games.forEach((game, index) => {
      if (game.is_tie_break) {
        if (
          game.tie_break_pair1_points >= 10 &&
          game.tie_break_pair1_points - game.tie_break_pair2_points >= 2
        ) {
          pair1Games++;
        } else if (
          game.tie_break_pair2_points >= 10 &&
          game.tie_break_pair2_points - game.tie_break_pair1_points >= 2
        ) {
          pair2Games++;
        } else {
          // EMPATE EN TIE-BREAK - AMBAS PAREJAS GANAN 1 JUEGO
          pair1Games++;
          pair2Games++;
        }
      } else {
        if (game.pair1_games > game.pair2_games) {
          pair1Games++;
        } else if (game.pair2_games > game.pair1_games) {
          pair2Games++;
        } else {
          // EMPATE EN JUEGO - AMBAS PAREJAS GANAN 1 JUEGO
          pair1Games++;
          pair2Games++;
        }
      }
    });

    const isTie = pair1Games === pair2Games;
    const winnerId = isTie
      ? undefined
      : pair1Games > pair2Games
      ? match.pair1_id
      : match.pair2_id;

    const canFinish = this.canFinishMatch(games);
    const reason = canFinish ? "Puede finalizar" : "Marcadores inválidos";

    return {
      pair1Games,
      pair2Games,
      isTie,
      winnerId,
      canFinish,
      reason,
    };
  }
}
