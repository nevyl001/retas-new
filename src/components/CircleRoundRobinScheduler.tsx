import {
  Pair,
  Match,
  createMatch,
  deleteMatchesByTournament,
} from "../lib/database";

export interface CircleSchedulingResult {
  success: boolean;
  message: string;
  matches: Array<{
    pair1: Pair;
    pair2: Pair;
    round: number;
    court: number;
  }>;
  totalRounds: number;
}

export class CircleRoundRobinScheduler {
  /**
   * Implementa el algoritmo Round Robin clásico usando el método del círculo
   *
   * Algoritmo:
   * 1. Fijar una pareja como ancla (primera pareja)
   * 2. Rotar las demás parejas en cada ronda
   * 3. Emparejar la ancla con una diferente en cada ronda
   * 4. El resto se emparejan entre sí
   */
  private static generateCircleRoundRobin(
    pairs: Pair[],
    courts: number
  ): Array<{ pair1: Pair; pair2: Pair; round: number; court: number }> {
    console.log(
      "🎯 === ALGORITMO ROUND ROBIN CLÁSICO (MÉTODO DEL CÍRCULO) ==="
    );
    console.log(`📊 Parejas: ${pairs.length}`);
    console.log(`🏟️ Canchas: ${courts}`);

    if (pairs.length < 2) {
      return [];
    }

    const matches: Array<{
      pair1: Pair;
      pair2: Pair;
      round: number;
      court: number;
    }> = [];

    // Paso 1: Fijar la primera pareja como ancla
    const anchorPair = pairs[0];
    const rotatingPairs = pairs.slice(1); // Todas las demás parejas

    console.log(
      `🎯 Pareja ancla: ${anchorPair.player1_name}/${anchorPair.player2_name}`
    );
    console.log(`🔄 Parejas rotantes: ${rotatingPairs.length}`);
    rotatingPairs.forEach((pair, index) => {
      console.log(`   ${index + 1}. ${pair.player1_name}/${pair.player2_name}`);
    });

    // Paso 2: Calcular número total de rondas
    const totalRounds = pairs.length - 1;
    console.log(`🔄 Total rondas necesarias: ${totalRounds}`);

    // Paso 3: Generar cada ronda usando el método del círculo
    for (let round = 1; round <= totalRounds; round++) {
      console.log(`\n🔄 === RONDA ${round} ===`);

      const roundMatches: Array<{
        pair1: Pair;
        pair2: Pair;
        round: number;
        court: number;
      }> = [];

      // Paso 4: Crear array de parejas para esta ronda
      const roundPairs = [anchorPair, ...rotatingPairs];

      // Paso 5: Generar partidos para esta ronda
      // Rotar la cancha inicial para la pareja ancla
      const anchorCourtStart = ((round - 1) % courts) + 1;
      let court = anchorCourtStart;

      // Emparejar desde el centro hacia afuera
      for (let i = 0; i < Math.floor(roundPairs.length / 2); i++) {
        const pair1 = roundPairs[i];
        const pair2 = roundPairs[roundPairs.length - 1 - i];

        // Solo crear partido si no excedemos el número de canchas
        if (i < courts) {
          const match = {
            pair1,
            pair2,
            round,
            court,
          };

          roundMatches.push(match);

          console.log(
            `  ✅ Cancha ${court}: ${pair1.player1_name}/${pair1.player2_name} vs ${pair2.player1_name}/${pair2.player2_name}`
          );

          // Rotar la cancha para el siguiente partido
          court = ((court - 1 + 1) % courts) + 1;
        }
      }

      // Paso 6: Agregar partidos de esta ronda al resultado
      matches.push(...roundMatches);

      console.log(
        `✅ Ronda ${round} completada: ${roundMatches.length} partidos`
      );

      // Paso 7: Rotar las parejas para la siguiente ronda (método del círculo)
      if (round < totalRounds) {
        // Rotar las parejas rotantes (no la ancla)
        const lastPair = rotatingPairs.pop();
        if (lastPair) {
          rotatingPairs.unshift(lastPair);
        }

        console.log(`🔄 Parejas rotadas para ronda ${round + 1}`);
      }
    }

    console.log(`\n🎯 === DISTRIBUCIÓN COMPLETADA ===`);
    console.log(`📊 Total partidos: ${matches.length}`);
    console.log(`🔄 Total rondas: ${totalRounds}`);

    // Verificar distribución
    this.verifyCircleDistribution(matches, pairs, courts);

    return matches;
  }

  /**
   * Verifica que la distribución cumple con las reglas del round robin clásico
   */
  private static verifyCircleDistribution(
    matches: Array<{ pair1: Pair; pair2: Pair; round: number; court: number }>,
    pairs: Pair[],
    courts: number
  ): void {
    console.log(`\n📋 === VERIFICACIÓN DEL MÉTODO DEL CÍRCULO ===`);

    // Agrupar partidos por ronda
    const matchesByRound: {
      [key: number]: Array<{
        pair1: Pair;
        pair2: Pair;
        round: number;
        court: number;
      }>;
    } = {};
    matches.forEach((match) => {
      if (!matchesByRound[match.round]) {
        matchesByRound[match.round] = [];
      }
      matchesByRound[match.round].push(match);
    });

    let allCorrect = true;

    // Verificar cada ronda
    Object.keys(matchesByRound).forEach((roundNum) => {
      const roundMatches = matchesByRound[parseInt(roundNum)];
      console.log(
        `\n🔄 Verificando Ronda ${roundNum}: ${roundMatches.length} partidos`
      );

      // Verificar que no hay más partidos que canchas
      if (roundMatches.length > courts) {
        console.error(
          `❌ ERROR: Ronda ${roundNum} tiene ${roundMatches.length} partidos pero solo hay ${courts} canchas`
        );
        allCorrect = false;
      } else {
        console.log(
          `✅ Ronda ${roundNum}: ${roundMatches.length} partidos ≤ ${courts} canchas`
        );
      }

      // Verificar que cada cancha tiene máximo 1 partido
      const courtsUsed = new Set<number>();
      roundMatches.forEach((match) => {
        if (courtsUsed.has(match.court)) {
          console.error(
            `❌ ERROR: Cancha ${match.court} tiene múltiples partidos en ronda ${roundNum}`
          );
          allCorrect = false;
        } else {
          courtsUsed.add(match.court);
        }
      });

      if (courtsUsed.size === roundMatches.length) {
        console.log(`✅ Cada cancha tiene máximo 1 partido`);
      }

      // Verificar que cada pareja solo juega una vez por ronda
      const pairsUsed = new Set<string>();
      roundMatches.forEach((match) => {
        if (pairsUsed.has(match.pair1.id)) {
          console.error(
            `❌ ERROR: Pareja ${match.pair1.player1_name}/${match.pair1.player2_name} juega múltiples veces en ronda ${roundNum}`
          );
          allCorrect = false;
        } else {
          pairsUsed.add(match.pair1.id);
        }

        if (pairsUsed.has(match.pair2.id)) {
          console.error(
            `❌ ERROR: Pareja ${match.pair2.player1_name}/${match.pair2.player2_name} juega múltiples veces en ronda ${roundNum}`
          );
          allCorrect = false;
        } else {
          pairsUsed.add(match.pair2.id);
        }
      });

      if (pairsUsed.size === roundMatches.length * 2) {
        console.log(`✅ Cada pareja juega solo una vez por ronda`);
      }

      // Mostrar distribución por cancha
      console.log(`  📍 Distribución por cancha:`);
      for (let c = 1; c <= courts; c++) {
        const courtMatch = roundMatches.find((m) => m.court === c);
        if (courtMatch) {
          console.log(
            `    🏟️ Cancha ${c}: ${courtMatch.pair1.player1_name}/${courtMatch.pair1.player2_name} vs ${courtMatch.pair2.player1_name}/${courtMatch.pair2.player2_name}`
          );
        } else {
          console.log(`    🏟️ Cancha ${c}: Sin partido`);
        }
      }
    });

    // Verificar que todas las parejas se enfrentan (round robin completo)
    console.log(`\n🎯 === VERIFICACIÓN DE ENFRENTAMIENTOS ===`);
    const pairMatchups = new Set<string>();

    matches.forEach((match) => {
      const key1 = `${match.pair1.id}-${match.pair2.id}`;
      const key2 = `${match.pair2.id}-${match.pair1.id}`;
      pairMatchups.add(key1);
      pairMatchups.add(key2);
    });

    const expectedCombinations = (pairs.length * (pairs.length - 1)) / 2;
    const actualMatchups = pairMatchups.size / 2;

    console.log(`📊 Enfrentamientos únicos: ${actualMatchups}`);
    console.log(`🎯 Combinaciones esperadas: ${expectedCombinations}`);

    if (actualMatchups === expectedCombinations) {
      console.log(
        `✅ Todas las parejas se enfrentan correctamente (round robin completo)`
      );
    } else {
      console.log(
        `❌ ERROR: Faltan ${
          expectedCombinations - actualMatchups
        } enfrentamientos`
      );
      allCorrect = false;
    }

    // Verificar que la pareja ancla no siempre está en la misma cancha
    console.log(`\n🎯 === VERIFICACIÓN DE ROTACIÓN DE CANCHAS ===`);
    const anchorPair = pairs[0];
    const anchorCourtDistribution: { [key: number]: number } = {};

    matches.forEach((match) => {
      if (
        match.pair1.id === anchorPair.id ||
        match.pair2.id === anchorPair.id
      ) {
        anchorCourtDistribution[match.court] =
          (anchorCourtDistribution[match.court] || 0) + 1;
      }
    });

    const courtsUsedByAnchor = Object.keys(anchorCourtDistribution).length;
    console.log(`🏟️ Canchas usadas por la pareja ancla: ${courtsUsedByAnchor}`);

    if (courtsUsedByAnchor > 1) {
      console.log(`✅ Pareja ancla rota entre diferentes canchas`);
    } else {
      console.log(`⚠️ Pareja ancla siempre en la misma cancha`);
    }

    // Resultado final de la verificación
    if (allCorrect) {
      console.log(
        `\n🎉 ✅ MÉTODO DEL CÍRCULO PERFECTO - TODAS LAS REGLAS CUMPLIDAS`
      );
    } else {
      console.log(`\n❌ MÉTODO DEL CÍRCULO CON ERRORES - REVISAR ALGORITMO`);
    }
  }

  /**
   * Programa un torneo completo usando el método del círculo
   */
  static async scheduleTournament(
    tournamentId: string,
    pairs: Pair[],
    courts: number
  ): Promise<CircleSchedulingResult> {
    try {
      console.log("🚀 === INICIANDO PROGRAMACIÓN MÉTODO DEL CÍRCULO ===");
      console.log(`🏆 Torneo ID: ${tournamentId}`);
      console.log(`👥 Parejas: ${pairs.length}`);
      console.log(`🏟️ Canchas: ${courts}`);

      if (pairs.length < 2) {
        return {
          success: false,
          message: "Se necesitan al menos 2 parejas para iniciar el torneo",
          matches: [],
          totalRounds: 0,
        };
      }

      // Eliminar partidos existentes
      console.log("🗑️ Eliminando partidos existentes...");
      await deleteMatchesByTournament(tournamentId);

      // Generar partidos usando el método del círculo
      const matches = this.generateCircleRoundRobin(pairs, courts);

      if (matches.length === 0) {
        return {
          success: false,
          message: "No se pudieron generar partidos",
          matches: [],
          totalRounds: 0,
        };
      }

      // Crear partidos en la base de datos
      console.log("💾 Creando partidos en la base de datos...");
      const createdMatches: Match[] = [];

      for (const match of matches) {
        try {
          const createdMatch = await createMatch(
            tournamentId,
            match.pair1.id,
            match.pair2.id,
            match.court,
            match.round
          );
          createdMatches.push(createdMatch);
          console.log(
            `✅ Partido creado: ${match.pair1.player1_name}/${match.pair1.player2_name} vs ${match.pair2.player1_name}/${match.pair2.player2_name} - Cancha ${match.court} - Ronda ${match.round}`
          );
        } catch (error) {
          console.error(`❌ Error creando partido:`, error);
          throw error;
        }
      }

      const totalRounds = Math.max(...matches.map((m) => m.round));

      console.log("🎉 === TORNEO PROGRAMADO EXITOSAMENTE ===");
      console.log(`📊 Total partidos creados: ${createdMatches.length}`);
      console.log(`🔄 Total rondas: ${totalRounds}`);

      return {
        success: true,
        message: `Torneo programado exitosamente usando método del círculo. ${createdMatches.length} partidos distribuidos en ${totalRounds} rondas`,
        matches,
        totalRounds,
      };
    } catch (error) {
      console.error("❌ Error programando torneo:", error);
      return {
        success: false,
        message: `Error al programar el torneo: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`,
        matches: [],
        totalRounds: 0,
      };
    }
  }
}
