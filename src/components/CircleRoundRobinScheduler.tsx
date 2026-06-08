import {
  Pair,
  Match,
  createMatch,
  deleteMatchesByTournament,
} from "../lib/database";
import { generateCircleRoundRobinSchedule } from "../lib/circleRoundRobinSchedule";

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

/** Opciones al iniciar por formato Equipos. */
export interface ScheduleTeamsOptions {
  teamsCount: number;
  teamNames?: string[];
  pairToTeam?: Record<string, number>;
}

export class CircleRoundRobinScheduler {
  /**
   * Punto de entrada único: según el formato elegido usa el algoritmo correcto.
   * - Round Robin: todos contra todos (cada pareja juega con todas las demás).
   * - Equipos: equipo vs equipo (solo partidos entre parejas de equipos distintos).
   */
  static async scheduleByFormat(
    tournamentId: string,
    pairs: Pair[],
    courts: number,
    userId: string,
    format: "roundRobin" | "teams",
    options?: ScheduleTeamsOptions
  ): Promise<CircleSchedulingResult> {
    if (format === "teams" && options?.teamsCount) {
      return this.scheduleTournamentTeams(
        tournamentId,
        pairs,
        courts,
        userId,
        options.teamsCount,
        options.pairToTeam
      );
    }
    return this.scheduleTournament(tournamentId, pairs, courts, userId);
  }

  private static assignTeamsToPairs(
    pairs: Pair[],
    teamsCount: number
  ): Map<string, number> {
    const safeTeams = Math.min(Math.max(2, teamsCount), pairs.length);
    const sortedPairs = [...pairs].sort((a, b) => a.id.localeCompare(b.id));
    const teamByPairId = new Map<string, number>();
    sortedPairs.forEach((pair, idx) => {
      teamByPairId.set(pair.id, idx % safeTeams);
    });
    return teamByPairId;
  }

  /**
   * Genera calendario por equipos: cada ronda con partidos simultáneos en todas las canchas,
   * todas las parejas de un equipo contra las del otro, sin que nadie descanse (cuando equipos iguales).
   * Round-robin entre dos grupos. Rotación de canchas para AMBOS equipos: en cada ronda la asignación
   * slot → cancha rota para que todas las parejas (equipo0 y equipo1) jueguen en canchas distintas.
   */
  private static generateTeamsSchedule(
    pairs: Pair[],
    courts: number,
    teamsCount: number,
    pairToTeam?: Record<string, number>
  ): Array<{ pair1: Pair; pair2: Pair; round: number; court: number }> {
    console.log("🏁 === PROGRAMACIÓN POR EQUIPOS (SIMULTÁNEOS, SIN DESCANSOS) ===");
    console.log(`📊 Parejas: ${pairs.length}`);
    console.log(`🏟️ Canchas: ${courts}`);
    console.log(`👥 Equipos: ${teamsCount}`);

    if (pairs.length < 2) return [];
    const teamByPairId =
      pairToTeam && Object.keys(pairToTeam).length > 0
        ? new Map<string, number>(Object.entries(pairToTeam).map(([k, v]) => [k, v]))
        : this.assignTeamsToPairs(pairs, Math.min(Math.max(2, teamsCount), pairs.length));

    // Solo 2 equipos: índice 0 y 1
    const team0Pairs = pairs
      .filter((p) => teamByPairId.get(p.id) === 0)
      .sort((a, b) => a.id.localeCompare(b.id));
    const team1Pairs = pairs
      .filter((p) => teamByPairId.get(p.id) === 1)
      .sort((a, b) => a.id.localeCompare(b.id));

    const n0 = team0Pairs.length;
    const n1 = team1Pairs.length;
    if (n0 === 0 || n1 === 0) {
      console.warn("Un equipo no tiene parejas; se requiere al menos una pareja por equipo.");
      return [];
    }

    const n = Math.min(n0, n1);
    const matchesPerRound = Math.min(n, courts);
    const totalRounds = Math.ceil((n0 * n1) / matchesPerRound);
    const team0First = n0 <= n1;

    console.log(`👥 Equipo 0: ${n0} parejas, Equipo 1: ${n1} parejas`);
    console.log(`🔄 Partidos por ronda: ${matchesPerRound} (simultáneos en todas las canchas)`);
    console.log(`🔄 Total rondas: ${totalRounds}`);
    console.log(`🔄 Rotación de canchas: ambos equipos cambian de cancha cada ronda`);

    const scheduled: Array<{
      pair1: Pair;
      pair2: Pair;
      round: number;
      court: number;
    }> = [];

    // Round-robin: ambos equipos rotan de rival y de cancha.
    // Ronda r: equipo0[i] vs equipo1[(i+r-1)%n1] (si n0<=n1), o equipo0[(i+r-1)%n0] vs equipo1[i].
    // Cancha: rotamos la asignación (slot → cancha) por ronda para que las parejas de ambos equipos cambien de cancha.
    for (let r = 1; r <= totalRounds; r++) {
      const roundMatches: Array<{ pair1: Pair; pair2: Pair }> = [];
      for (let i = 0; i < matchesPerRound; i++) {
        const pair0 = team0First
          ? team0Pairs[i]
          : team0Pairs[(i + (r - 1)) % n0];
        const pair1 = team0First
          ? team1Pairs[(i + (r - 1)) % n1]
          : team1Pairs[i];
        roundMatches.push({ pair1: pair0, pair2: pair1 });
      }
      // Asignar cancha rotando por ronda: así ambas parejas del partido (equipo0 y equipo1) cambian de cancha cada ronda.
      const roundOffset = (r - 1) % Math.max(1, matchesPerRound);
      for (let slotIndex = 0; slotIndex < roundMatches.length; slotIndex++) {
        const m = roundMatches[slotIndex];
        const rotatedSlot = (slotIndex + roundOffset) % matchesPerRound;
        const court = ((r - 1) + rotatedSlot) % courts + 1;
        scheduled.push({
          pair1: m.pair1,
          pair2: m.pair2,
          round: r,
          court,
        });
      }
      console.log(`✅ Ronda ${r}: ${roundMatches.length} partidos simultáneos en todas las canchas`);
    }

    const bad = scheduled.filter((m) => {
      const t1 = teamByPairId.get(m.pair1.id);
      const t2 = teamByPairId.get(m.pair2.id);
      return t1 !== undefined && t2 !== undefined && t1 === t2;
    });
    if (bad.length > 0) {
      console.error(`❌ ERROR: Se detectaron ${bad.length} partidos intra-equipo`);
    }
    return scheduled;
  }

  private static generateCircleRoundRobin(
    pairs: Pair[],
    courts: number
  ): Array<{ pair1: Pair; pair2: Pair; round: number; court: number }> {
    console.log(
      "🎯 === ALGORITMO ROUND ROBIN CORRECTO (MÉTODO DEL CÍRCULO) ==="
    );
    console.log(`📊 Parejas: ${pairs.length}`);
    console.log(`🏟️ Canchas: ${courts}`);

    const matches = generateCircleRoundRobinSchedule(pairs, courts);
    const expectedMatches = (pairs.length * (pairs.length - 1)) / 2;

    matches.forEach((m) => {
      console.log(
        `  ✅ R${m.round} Cancha ${m.court}: ${m.pair1.player1_name}/${m.pair1.player2_name} vs ${m.pair2.player1_name}/${m.pair2.player2_name}`
      );
    });

    console.log(`\n🎯 === DISTRIBUCIÓN COMPLETADA ===`);
    console.log(`📊 Total partidos generados: ${matches.length}`);
    const maxTimeRound =
      matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;
    console.log(
      `🔄 Rondas de tiempo (≤${courts} partido(s) simultáneo(s) por paso): ${maxTimeRound}`
    );
    console.log(`🎯 Partidos esperados: ${expectedMatches}`);

    if (matches.length !== expectedMatches) {
      console.error(
        `❌ ERROR: Se generaron ${matches.length} partidos pero se esperaban ${expectedMatches}`
      );
    } else {
      console.log(`✅ Número correcto de partidos generados`);
    }

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
    console.log(`\n📋 === VERIFICACIÓN COMPLETA DEL ALGORITMO ===`);

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
    });

    // Verificar que todas las parejas se enfrentan EXACTAMENTE UNA VEZ (round robin completo)
    console.log(`\n🎯 === VERIFICACIÓN DE ENFRENTAMIENTOS ÚNICOS ===`);
    const pairMatchups = new Set<string>();
    const matchupCounts: { [key: string]: number } = {};

    matches.forEach((match) => {
      // Crear clave única para el enfrentamiento (ordenar IDs para que A-B = B-A)
      const ids = [match.pair1.id, match.pair2.id].sort();
      const key = `${ids[0]}-${ids[1]}`;
      pairMatchups.add(key);
      matchupCounts[key] = (matchupCounts[key] || 0) + 1;
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
      allCorrect = false;

      // Mostrar qué enfrentamientos faltan
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
        missing.slice(0, 10).forEach(key => {
          const [id1, id2] = key.split('-');
          const p1 = pairs.find(p => p.id === id1);
          const p2 = pairs.find(p => p.id === id2);
          if (p1 && p2) {
            console.error(`   - ${p1.player1_name}/${p1.player2_name} vs ${p2.player1_name}/${p2.player2_name}`);
          }
        });
      }

      // Verificar repeticiones
      const repeated = Object.keys(matchupCounts).filter(key => matchupCounts[key] > 1);
      if (repeated.length > 0) {
        console.error(`❌ Enfrentamientos repetidos: ${repeated.length}`);
        repeated.slice(0, 10).forEach(key => {
          const [id1, id2] = key.split('-');
          const p1 = pairs.find(p => p.id === id1);
          const p2 = pairs.find(p => p.id === id2);
          if (p1 && p2) {
            console.error(`   - ${p1.player1_name}/${p1.player2_name} vs ${p2.player1_name}/${p2.player2_name} (${matchupCounts[key]} veces)`);
          }
        });
      }
    }

    if (courts > 1) {
      const courtsByPair = new Map<string, Set<number>>();
      matches.forEach((match) => {
        for (const pair of [match.pair1, match.pair2]) {
          if (!courtsByPair.has(pair.id)) {
            courtsByPair.set(pair.id, new Set());
          }
          courtsByPair.get(pair.id)!.add(match.court);
        }
      });
      pairs.forEach((pair) => {
        const played = matches.filter(
          (m) => m.pair1.id === pair.id || m.pair2.id === pair.id
        ).length;
        const usedCourts = courtsByPair.get(pair.id);
        if (played >= 2 && usedCourts && usedCourts.size === 1) {
          console.warn(
            `⚠️ ${pair.player1_name}/${pair.player2_name} siempre juega en cancha ${Array.from(usedCourts)[0]}`
          );
        }
      });
    }

    // Round robin: cada pareja disputa exactamente (n - 1) partidos
    console.log(`\n📊 === PARTIDOS POR PAREJA (esperado: ${pairs.length - 1} c/u) ===`);
    const playedCount: { [pairId: string]: number } = {};
    pairs.forEach((p) => {
      playedCount[p.id] = 0;
    });
    matches.forEach((m) => {
      playedCount[m.pair1.id] = (playedCount[m.pair1.id] || 0) + 1;
      playedCount[m.pair2.id] = (playedCount[m.pair2.id] || 0) + 1;
    });
    const expectedGamesPerPair = pairs.length - 1;
    pairs.forEach((pair) => {
      const c = playedCount[pair.id] || 0;
      if (c !== expectedGamesPerPair) {
        console.error(
          `❌ ERROR: Pareja ${pair.player1_name}/${pair.player2_name} jugó ${c} partidos (esperado ${expectedGamesPerPair})`
        );
        allCorrect = false;
      } else {
        console.log(
          `  ✅ ${pair.player1_name}/${pair.player2_name}: ${c} partidos`
        );
      }
    });

    // Resultado final de la verificación
    if (allCorrect) {
      console.log(
        `\n🎉 ✅ ALGORITMO PERFECTO - TODAS LAS REGLAS CUMPLIDAS`
      );
    } else {
      console.log(`\n❌ ALGORITMO CON ERRORES - REVISAR CÓDIGO`);
    }
  }

  /**
   * Round Robin: todos contra todos. Cada pareja se enfrenta con todas las demás exactamente una vez.
   * Usar cuando el formato de reta sea "Round Robin".
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
      const expectedMatches = (pairs.length * (pairs.length - 1)) / 2;

      console.log("🎉 === TORNEO PROGRAMADO EXITOSAMENTE ===");
      console.log(`📊 Total partidos creados: ${createdMatches.length}`);
      console.log(`🔄 Total rondas: ${totalRounds}`);
      console.log(`🎯 Partidos esperados: ${expectedMatches}`);

      if (createdMatches.length !== expectedMatches) {
        console.error(`❌ ADVERTENCIA: Se crearon ${createdMatches.length} partidos pero se esperaban ${expectedMatches}`);
      }

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

  /**
   * Por equipos: solo partidos entre equipos distintos (equipo A vs equipo B).
   * Las parejas del mismo equipo nunca se enfrentan entre sí.
   * Usar cuando el formato de reta sea "Equipos".
   */
  static async scheduleTournamentTeams(
    tournamentId: string,
    pairs: Pair[],
    courts: number,
    userId: string,
    teamsCount: number,
    pairToTeam?: Record<string, number>
  ): Promise<CircleSchedulingResult> {
    try {
      console.log("🚀 === INICIANDO PROGRAMACIÓN POR EQUIPOS ===");
      console.log(`🏆 Reta ID: ${tournamentId}`);
      console.log(`👥 Parejas: ${pairs.length}`);
      console.log(`🏟️ Canchas: ${courts}`);
      console.log(`👥 Equipos: ${teamsCount}`);

      if (pairs.length < 2) {
        return {
          success: false,
          message: "Se necesitan al menos 2 parejas para iniciar la reta",
          matches: [],
          totalRounds: 0,
        };
      }
      if (teamsCount < 2 || teamsCount > pairs.length) {
        return {
          success: false,
          message: `Número de equipos inválido. Debe estar entre 2 y ${pairs.length}.`,
          matches: [],
          totalRounds: 0,
        };
      }

      console.log("🗑️ Eliminando partidos existentes...");
      await deleteMatchesByTournament(tournamentId);

      const matches = this.generateTeamsSchedule(pairs, courts, teamsCount, pairToTeam);
      if (matches.length === 0) {
        return {
          success: false,
          message: "No se pudieron generar partidos por equipos",
          matches: [],
          totalRounds: 0,
        };
      }

      console.log("💾 Creando partidos en la base de datos...");
      const createdMatches: Match[] = [];
      for (const match of matches) {
        const createdMatch = await createMatch(
          tournamentId,
          match.pair1.id,
          match.pair2.id,
          match.court,
          match.round,
          userId
        );
        createdMatches.push(createdMatch);
      }

      const totalRounds = Math.max(...matches.map((m) => m.round));
      return {
        success: true,
        message: `Reta programada por equipos. ${createdMatches.length} partidos distribuidos en ${totalRounds} rondas (sin enfrentamientos dentro del mismo equipo).`,
        matches,
        totalRounds,
      };
    } catch (error) {
      console.error("❌ Error programando reta por equipos:", error);
      return {
        success: false,
        message: `Error al programar la reta por equipos: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`,
        matches: [],
        totalRounds: 0,
      };
    }
  }
}
