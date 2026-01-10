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
   * Algoritmo del círculo para números impares:
   * 1. Crear un círculo virtual con todas las parejas
   * 2. En cada ronda, una pareja diferente descansa (se fija en el centro)
   * 3. Las demás parejas se emparejan desde los extremos hacia el centro
   * 4. Rotar las parejas para que cada una descanse exactamente una vez
   *
   * Algoritmo del círculo para números pares:
   * 1. Similar pero sin pareja que descansa (todas juegan en cada ronda)
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

    const isOdd = pairs.length % 2 === 1;
    
    // Paso 1: Calcular número total de rondas
    // Para round-robin completo:
    // - Si N es par: necesitamos N-1 rondas (todas las parejas juegan en cada ronda)
    // - Si N es impar: necesitamos N rondas (cada pareja descansa una vez)
    const totalRounds = isOdd ? pairs.length : pairs.length - 1;
    console.log(`🔄 Total rondas necesarias: ${totalRounds} (${pairs.length} parejas, ${isOdd ? 'impar' : 'par'})`);

    // Paso 2: Crear array circular de parejas (todas las parejas rotarán)
    let circularPairs = [...pairs];

    // Paso 3: Generar cada ronda usando el método del círculo
    for (let round = 1; round <= totalRounds; round++) {
      console.log(`\n🔄 === RONDA ${round} ===`);

      const roundMatches: Array<{
        pair1: Pair;
        pair2: Pair;
        round: number;
        court: number;
      }> = [];

      // Paso 4: Determinar qué pareja descansa en esta ronda (solo para números impares)
      let restingPairIndex: number | null = null;
      let playingPairs: Pair[];

      if (isOdd) {
        // Para números impares: la pareja en el medio descansa
        // En la ronda 1, la primera pareja descansa, en la ronda 2 la segunda, etc.
        restingPairIndex = (round - 1) % circularPairs.length;
        const restingPair = circularPairs[restingPairIndex];
        
        // Crear array de parejas que juegan (todas excepto la que descansa)
        playingPairs = circularPairs.filter((_, index) => index !== restingPairIndex);
        
        console.log(`😴 Pareja que descansa: ${restingPair.player1_name}/${restingPair.player2_name}`);
      } else {
        // Para números pares: todas las parejas juegan
        playingPairs = [...circularPairs];
      }

      // Paso 5: Emparejar las parejas que juegan desde los extremos hacia el centro
      // Rotar la cancha inicial
      let court = ((round - 1) % courts) + 1;
      
      // Emparejar: primera con última, segunda con penúltima, etc.
      for (let i = 0; i < Math.floor(playingPairs.length / 2); i++) {
        const pair1 = playingPairs[i];
        const pair2 = playingPairs[playingPairs.length - 1 - i];

        // Solo crear partido si no excedemos el número de canchas disponibles
        if (roundMatches.length < courts) {
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

      if (isOdd && restingPairIndex !== null) {
        const restingPair = circularPairs[restingPairIndex];
        console.log(
          `✅ Ronda ${round} completada: ${roundMatches.length} partidos, ${restingPair.player1_name}/${restingPair.player2_name} descansa`
        );
      } else {
        console.log(
          `✅ Ronda ${round} completada: ${roundMatches.length} partidos`
        );
      }

      // Paso 7: Rotar el círculo de parejas para la siguiente ronda
      // Rotar una posición hacia la izquierda: [A,B,C,D] -> [B,C,D,A]
      // Esto asegura que cada pareja tenga la oportunidad de descansar (para impares) o de rotar su posición (para pares)
      if (round < totalRounds) {
        const firstPair = circularPairs.shift();
        if (firstPair) {
          circularPairs.push(firstPair);
        }
        console.log(`🔄 Círculo rotado para ronda ${round + 1}`);
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

    // Verificar que cada pareja descansa exactamente una vez (solo para números impares)
    if (pairs.length % 2 === 1) {
      console.log(`\n😴 === VERIFICACIÓN DE PAREJAS QUE DESCANSAN ===`);
      const totalRounds = pairs.length;
      const pairsRestingCount: { [pairId: string]: number } = {};

      // Inicializar contador para cada pareja
      pairs.forEach((pair) => {
        pairsRestingCount[pair.id] = 0;
      });

      // Para cada ronda, identificar qué pareja descansa
      for (let round = 1; round <= totalRounds; round++) {
        const roundMatches = matchesByRound[round] || [];
        const playingPairIds = new Set<string>();
        
        roundMatches.forEach((match) => {
          playingPairIds.add(match.pair1.id);
          playingPairIds.add(match.pair2.id);
        });

        // Encontrar la pareja que descansa (la que no está jugando)
        const restingPair = pairs.find((pair) => !playingPairIds.has(pair.id));
        
        if (restingPair) {
          pairsRestingCount[restingPair.id] = (pairsRestingCount[restingPair.id] || 0) + 1;
          console.log(`  Ronda ${round}: ${restingPair.player1_name}/${restingPair.player2_name} descansa`);
        }
      }

      // Verificar que cada pareja descansa exactamente una vez
      let restingCorrect = true;
      pairs.forEach((pair) => {
        const restCount = pairsRestingCount[pair.id] || 0;
        if (restCount !== 1) {
          console.error(
            `❌ ERROR: Pareja ${pair.player1_name}/${pair.player2_name} descansa ${restCount} veces (debería ser 1)`
          );
          restingCorrect = false;
          allCorrect = false;
        } else {
          console.log(`  ✅ ${pair.player1_name}/${pair.player2_name} descansa exactamente 1 vez`);
        }
      });

      if (restingCorrect) {
        console.log(`✅ Todas las parejas descansan exactamente una vez`);
      }
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
   * Programa una reta completa usando el método del círculo
   */
  static async scheduleTournament(
    tournamentId: string,
    pairs: Pair[],
    courts: number,
    userId: string
  ): Promise<CircleSchedulingResult> {
    try {
      console.log("🚀 === INICIANDO PROGRAMACIÓN MÉTODO DEL CÍRCULO ===");
      console.log(`🏆 Reta ID: ${tournamentId}`);
      console.log(`👥 Parejas: ${pairs.length}`);
      console.log(`🏟️ Canchas: ${courts}`);

      if (pairs.length < 2) {
        return {
          success: false,
          message: "Se necesitan al menos 2 parejas para iniciar la reta",
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
            match.round,
            userId
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
        message: `Reta programada exitosamente usando método del círculo. ${createdMatches.length} partidos distribuidos en ${totalRounds} rondas`,
        matches,
        totalRounds,
      };
    } catch (error) {
      console.error("❌ Error programando reta:", error);
      return {
        success: false,
        message: `Error al programar la reta: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`,
        matches: [],
        totalRounds: 0,
      };
    }
  }
}
