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
   * Para números IMPARES (ej: 7 parejas):
   * - N rondas (7 rondas para 7 parejas)
   * - En cada ronda: (N-1)/2 partidos y 1 pareja descansa
   * - Cada pareja descansa exactamente una vez
   * - Todas las parejas se enfrentan exactamente una vez
   *
   * Para números PARES (ej: 6 parejas):
   * - N-1 rondas (5 rondas para 6 parejas)
   * - En cada ronda: N/2 partidos (todas juegan)
   * - Todas las parejas se enfrentan exactamente una vez
   */
  private static generateCircleRoundRobin(
    pairs: Pair[],
    courts: number
  ): Array<{ pair1: Pair; pair2: Pair; round: number; court: number }> {
    console.log(
      "🎯 === ALGORITMO ROUND ROBIN (MÉTODO DEL CÍRCULO CORRECTO) ==="
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
    const totalRounds = isOdd ? pairs.length : pairs.length - 1;

    console.log(`🔄 Total rondas: ${totalRounds} (${pairs.length} parejas, ${isOdd ? 'impar' : 'par'})`);

    if (isOdd) {
      // MÉTODO DEL CÍRCULO PARA NÚMEROS IMPARES
      // Todas las parejas rotan en círculo, una descansa en cada ronda
      let circularPairs = [...pairs];

      for (let round = 1; round <= totalRounds; round++) {
        console.log(`\n🔄 === RONDA ${round} ===`);

        const roundMatches: Array<{
          pair1: Pair;
          pair2: Pair;
          round: number;
          court: number;
        }> = [];

        // La pareja en el medio descansa
        const restingIndex = Math.floor(circularPairs.length / 2);
        const restingPair = circularPairs[restingIndex];
        
        // Todas las parejas excepto la que descansa
        const playingPairs = circularPairs.filter((_, index) => index !== restingIndex);
        
        console.log(`😴 Pareja que descansa: ${restingPair.player1_name}/${restingPair.player2_name}`);

        // Emparejar: primera con última, segunda con penúltima, etc.
        // Generar TODOS los partidos posibles hasta el límite de canchas disponibles
        let court = ((round - 1) % courts) + 1;
        const maxMatches = Math.min(Math.floor(playingPairs.length / 2), courts);
        
        for (let i = 0; i < maxMatches; i++) {
          const pair1 = playingPairs[i];
          const pair2 = playingPairs[playingPairs.length - 1 - i];

          roundMatches.push({
            pair1,
            pair2,
            round,
            court,
          });

          console.log(
            `  ✅ Cancha ${court}: ${pair1.player1_name}/${pair1.player2_name} vs ${pair2.player1_name}/${pair2.player2_name}`
          );

          // Rotar la cancha
          court = ((court - 1 + 1) % courts) + 1;
        }

        matches.push(...roundMatches);
        console.log(
          `✅ Ronda ${round}: ${roundMatches.length} partidos, ${restingPair.player1_name}/${restingPair.player2_name} descansa`
        );

        // Rotar el círculo completo una posición
        if (round < totalRounds) {
          const firstPair = circularPairs.shift();
          if (firstPair) {
            circularPairs.push(firstPair);
          }
          console.log(`🔄 Círculo rotado para ronda ${round + 1}`);
        }
      }
    } else {
      // MÉTODO DEL CÍRCULO PARA NÚMEROS PARES
      // Fijar la primera pareja, rotar las demás
      const fixedPair = pairs[0];
      let rotatingPairs = pairs.slice(1);

      console.log(`🎯 Pareja fija: ${fixedPair.player1_name}/${fixedPair.player2_name}`);
      console.log(`🔄 Parejas rotantes: ${rotatingPairs.length}`);

      for (let round = 1; round <= totalRounds; round++) {
        console.log(`\n🔄 === RONDA ${round} ===`);

        const roundMatches: Array<{
          pair1: Pair;
          pair2: Pair;
          round: number;
          court: number;
        }> = [];

        // Crear array con pareja fija + parejas rotantes
        const roundPairs = [fixedPair, ...rotatingPairs];

        // Emparejar: primera con última, segunda con penúltima, etc.
        // Generar TODOS los partidos posibles hasta el límite de canchas disponibles
        let court = ((round - 1) % courts) + 1;
        const maxMatches = Math.min(Math.floor(roundPairs.length / 2), courts);
        
        for (let i = 0; i < maxMatches; i++) {
          const pair1 = roundPairs[i];
          const pair2 = roundPairs[roundPairs.length - 1 - i];

          roundMatches.push({
            pair1,
            pair2,
            round,
            court,
          });

          console.log(
            `  ✅ Cancha ${court}: ${pair1.player1_name}/${pair1.player2_name} vs ${pair2.player1_name}/${pair2.player2_name}`
          );

          // Rotar la cancha
          court = ((court - 1 + 1) % courts) + 1;
        }

        matches.push(...roundMatches);
        console.log(`✅ Ronda ${round}: ${roundMatches.length} partidos`);

        // Rotar solo las parejas rotantes (no la fija)
        if (round < totalRounds) {
          const lastPair = rotatingPairs.pop();
          if (lastPair) {
            rotatingPairs.unshift(lastPair);
          }
          console.log(`🔄 Parejas rotantes rotadas para ronda ${round + 1}`);
        }
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

    // Verificar que todas las parejas se enfrentan EXACTAMENTE UNA VEZ (round robin completo)
    console.log(`\n🎯 === VERIFICACIÓN DE ENFRENTAMIENTOS ÚNICOS ===`);
    const pairMatchups = new Set<string>();

    matches.forEach((match) => {
      // Crear clave única para el enfrentamiento (ordenar IDs para que A-B = B-A)
      const ids = [match.pair1.id, match.pair2.id].sort();
      const key = `${ids[0]}-${ids[1]}`;
      pairMatchups.add(key);
    });

    const expectedCombinations = (pairs.length * (pairs.length - 1)) / 2;
    const actualMatchups = pairMatchups.size;

    console.log(`📊 Enfrentamientos únicos encontrados: ${actualMatchups}`);
    console.log(`🎯 Combinaciones esperadas: ${expectedCombinations}`);

    if (actualMatchups === expectedCombinations) {
      console.log(
        `✅ Todas las parejas se enfrentan exactamente una vez (round robin completo)`
      );
    } else {
      console.error(
        `❌ ERROR: Se encontraron ${actualMatchups} enfrentamientos únicos, pero se esperaban ${expectedCombinations}`
      );
      console.error(`❌ Faltan ${expectedCombinations - actualMatchups} enfrentamientos o hay repeticiones`);
      allCorrect = false;

      // Mostrar qué enfrentamientos faltan o están repetidos
      const allPairs = pairs.map(p => p.id);
      const expectedPairs: string[] = [];
      for (let i = 0; i < allPairs.length; i++) {
        for (let j = i + 1; j < allPairs.length; j++) {
          const key = `${allPairs[i]}-${allPairs[j]}`;
          expectedPairs.push(key);
        }
      }

      const missing = expectedPairs.filter(key => !pairMatchups.has(key));
      if (missing.length > 0) {
        console.error(`❌ Enfrentamientos faltantes: ${missing.length}`);
        missing.slice(0, 5).forEach(key => {
          const [id1, id2] = key.split('-');
          const p1 = pairs.find(p => p.id === id1);
          const p2 = pairs.find(p => p.id === id2);
          if (p1 && p2) {
            console.error(`   - ${p1.player1_name}/${p1.player2_name} vs ${p2.player1_name}/${p2.player2_name}`);
          }
        });
      }

      // Verificar repeticiones
      const matchupCounts: { [key: string]: number } = {};
      matches.forEach((match) => {
        const ids = [match.pair1.id, match.pair2.id].sort();
        const key = `${ids[0]}-${ids[1]}`;
        matchupCounts[key] = (matchupCounts[key] || 0) + 1;
      });

      const repeated = Object.keys(matchupCounts).filter(key => matchupCounts[key] > 1);
      if (repeated.length > 0) {
        console.error(`❌ Enfrentamientos repetidos: ${repeated.length}`);
        repeated.slice(0, 5).forEach(key => {
          const [id1, id2] = key.split('-');
          const p1 = pairs.find(p => p.id === id1);
          const p2 = pairs.find(p => p.id === id2);
          if (p1 && p2) {
            console.error(`   - ${p1.player1_name}/${p1.player2_name} vs ${p2.player1_name}/${p2.player2_name} (${matchupCounts[key]} veces)`);
          }
        });
      }
    }

    // Verificar que cada pareja descansa exactamente una vez (solo para números impares)
    if (pairs.length % 2 === 1) {
      console.log(`\n😴 === VERIFICACIÓN DE PAREJAS QUE DESCANSAN ===`);
      const pairsRestingCount: { [pairId: string]: number } = {};

      // Inicializar contador para cada pareja
      pairs.forEach((pair) => {
        pairsRestingCount[pair.id] = 0;
      });

      // Para cada ronda, identificar qué pareja descansa
      const totalRounds = pairs.length;
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
