import {
  Pair,
  Match,
  createMatchesBulk,
  getMatches,
  getTournamentGames,
  reassignTournamentMatchRoundsIfUnscored,
  replaceTournamentMatchesIfUnscored,
} from "../lib/database";
import {
  generateTeamsCrossSchedule,
  previewCircleRoundRobinSchedule,
  validateSchedule,
} from "../lib/circleRoundRobinSchedule";
import { debugLog } from "../lib/debug/debugLog";
import {
  buildResultsProtectionMessage,
  inspectTournamentResults,
} from "../lib/reta/tournamentResultGuards";
import { planRepackExistingRoundRobin } from "../lib/reta/repackRoundRobinRounds";

/** Respaldo JSON del calendario actual (sin UI nueva). */
function downloadScheduleBackupJson(
  tournamentId: string,
  matches: Match[]
): void {
  if (typeof document === "undefined") return;
  const payload = {
    exportedAt: new Date().toISOString(),
    tournamentId,
    matchCount: matches.length,
    matches: matches.map((m) => ({
      id: m.id,
      round: m.round,
      court: m.court,
      pair1_id: m.pair1_id,
      pair2_id: m.pair2_id,
      pair1_name: m.pair1_name,
      pair2_name: m.pair2_name,
      status: m.status,
      pair1_score: m.pair1_score ?? null,
      pair2_score: m.pair2_score ?? null,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reta-calendar-backup-${tournamentId.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pairMatchLabel(pair: Pair): string {
  return `${pair.player1_name}/${pair.player2_name}`;
}

function toBulkMatchRows(
  tournamentId: string,
  matches: Array<{ pair1: Pair; pair2: Pair; round: number; court: number }>
) {
  return matches.map((match) => ({
    tournamentId,
    pair1Id: match.pair1.id,
    pair2Id: match.pair2.id,
    pair1Name: pairMatchLabel(match.pair1),
    pair2Name: pairMatchLabel(match.pair2),
    court: match.court,
    round: match.round,
  }));
}

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
   * Genera calendario por equipos: partidos solo entre equipos distintos.
   * Si hay menos canchas que parejas por equipo, ambos equipos rotan quién
   * descansa cada ronda (no se queda sentada la misma pareja dos rondas seguidas).
   */
  private static generateTeamsSchedule(
    pairs: Pair[],
    courts: number,
    teamsCount: number,
    pairToTeam?: Record<string, number>
  ): Array<{ pair1: Pair; pair2: Pair; round: number; court: number }> {
    if (pairs.length < 2) return [];
    const teamByPairId =
      pairToTeam && Object.keys(pairToTeam).length > 0
        ? new Map<string, number>(
            Object.keys(pairToTeam).map((key) => [key, pairToTeam[key]])
          )
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

    const matchesPerRound = Math.min(n0, n1, Math.max(1, courts));

    // Ambos equipos: cobertura completa (todas vs todas) + rotación de descansos.
    const scheduled = generateTeamsCrossSchedule(team0Pairs, team1Pairs, courts);
    const totalRounds =
      scheduled.length > 0 ? Math.max(...scheduled.map((m) => m.round)) : 0;

    debugLog("[circle-rr-teams] generando calendario:", {
      equipo0: n0,
      equipo1: n1,
      partidosPorRonda: matchesPerRound,
      totalRondas: totalRounds,
      partidos: scheduled.length,
      crucesEsperados: n0 * n1,
    });

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
    const preview = previewCircleRoundRobinSchedule(pairs, courts);
    const matches = preview.schedule;
    const expectedMatches = (pairs.length * (pairs.length - 1)) / 2;
    const maxTimeRound =
      matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;

    debugLog("[circle-rr] distribución generada:", {
      parejas: pairs.length,
      canchas: courts,
      partidosGenerados: matches.length,
      partidosEsperados: expectedMatches,
      rondas: maxTimeRound,
      usedFallback: preview.usedFallback,
      seed: preview.seed,
      validationErrors: preview.errors,
    });

    if (preview.errors.length > 0) {
      throw new Error(
        `Calendario inválido; no se persistirá. ${preview.errors.join(" | ")}`
      );
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
    const errors = validateSchedule(
      matches.map((m) => ({
        pair1Id: m.pair1.id,
        pair2Id: m.pair2.id,
        round: m.round,
        court: m.court,
      })),
      pairs,
      courts
    );

    let allCorrect = errors.length === 0;
    if (!allCorrect) {
      console.error("❌ ERROR de validateSchedule:", errors);
    }

    // Verificar que todas las parejas se enfrentan EXACTAMENTE UNA VEZ (round robin completo)
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

    if (actualMatchups !== expectedCombinations) {
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
      }
    });

    // Resultado final de la verificación: solo se reporta si hubo errores
    // (los console.error individuales de arriba ya detallan cuáles).
    if (!allCorrect) {
      console.error(
        "[circle-rr] verificación del algoritmo encontró inconsistencias (ver errores anteriores)"
      );
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
      if (pairs.length < 2) {
        return {
          success: false,
          message: "Se necesitan al menos 2 parejas para iniciar la reta",
          matches: [],
          totalRounds: 0,
        };
      }

      // 1) Generar + validar en memoria (preview). Nunca escribir si es inválido.
      let matches: Array<{
        pair1: Pair;
        pair2: Pair;
        round: number;
        court: number;
      }>;
      try {
        matches = this.generateCircleRoundRobin(pairs, courts);
      } catch (genErr) {
        return {
          success: false,
          message:
            genErr instanceof Error
              ? genErr.message
              : "No se pudo generar un calendario válido",
          matches: [],
          totalRounds: 0,
        };
      }

      if (matches.length === 0) {
        return {
          success: false,
          message: "No se pudieron generar partidos",
          matches: [],
          totalRounds: 0,
        };
      }

      const previewErrors = validateSchedule(
        matches.map((m) => ({
          pair1Id: m.pair1.id,
          pair2Id: m.pair2.id,
          round: m.round,
          court: m.court,
        })),
        pairs,
        courts
      );
      if (previewErrors.length > 0) {
        return {
          success: false,
          message: `Calendario inválido; no se guardó nada. ${previewErrors.join(
            " | "
          )}`,
          matches: [],
          totalRounds: 0,
        };
      }

      const existingMatches = await getMatches(tournamentId);
      const existingGames = await getTournamentGames(tournamentId);
      const results = inspectTournamentResults(existingMatches, existingGames);

      // 2) Con marcadores (matches O games parciales): NO regenerar.
      if (results.scoredMatchIds.length > 0) {
        const plan = buildResultsProtectionMessage(results);
        console.warn("[circle-rr] regeneración bloqueada por marcadores:\n" + plan);
        return {
          success: false,
          message: plan,
          matches: [],
          totalRounds: 0,
        };
      }

      const totalRoundsPreview = Math.max(...matches.map((m) => m.round));
      const bulkRows = toBulkMatchRows(tournamentId, matches);

      // 3) Sin marcadores pero con partidos previos:
      // Preferir reasignar round/court conservando IDs (sin delete).
      if (existingMatches.length > 0) {
        downloadScheduleBackupJson(tournamentId, existingMatches);

        const expected = (pairs.length * (pairs.length - 1)) / 2;
        const repack = planRepackExistingRoundRobin(
          pairs,
          existingMatches,
          courts
        );

        if (repack.ok && existingMatches.length === expected) {
          const okRepack = window.confirm(
            `Se exportó un respaldo JSON (${existingMatches.length} partidos, 0 marcadores / 0 games).\n\n` +
              `Se reasignarán SOLO round/court a ${totalRoundsPreview} rondas conservando los mismos IDs de partido.\n\n` +
              `¿Aplicar reparación atómica?`
          );
          if (!okRepack) {
            return {
              success: false,
              message:
                "Operación cancelada: se conservó el calendario actual (respaldo JSON exportado).",
              matches: [],
              totalRounds: 0,
            };
          }

          const reassigned = await reassignTournamentMatchRoundsIfUnscored(
            tournamentId,
            repack.patches.map((p) => ({
              id: p.id,
              round: p.round,
              court: p.court,
            }))
          );
          if (!reassigned.ok) {
            return {
              success: false,
              message: reassigned.message,
              matches: [],
              totalRounds: 0,
            };
          }

          debugLog("[circle-rr] rondas reasignadas (IDs conservados):", {
            updated: reassigned.updated,
            totalRondas: totalRoundsPreview,
          });

          return {
            success: true,
            message: `Rondas reparadas de forma atómica. ${reassigned.updated} partidos conservaron su ID; ahora hay ${totalRoundsPreview} rondas.`,
            matches: repack.schedule,
            totalRounds: totalRoundsPreview,
          };
        }

        if (!repack.ok) {
          console.warn(
            "[circle-rr] no se pudo remapar conservando IDs:",
            repack.error,
            repack.details
          );
        }

        const ok = window.confirm(
          `Se exportó un respaldo JSON del calendario actual (${existingMatches.length} partidos, 0 marcadores / 0 games).\n\n` +
            `No fue posible remapar conservando IDs. ¿Reemplazar el calendario por uno nuevo (${matches.length} partidos / ${totalRoundsPreview} rondas) de forma atómica?`
        );
        if (!ok) {
          return {
            success: false,
            message:
              "Operación cancelada: se conservó el calendario actual (respaldo JSON exportado).",
            matches: [],
            totalRounds: 0,
          };
        }

        const replaced = await replaceTournamentMatchesIfUnscored(
          tournamentId,
          bulkRows
        );
        if (!replaced.ok) {
          return {
            success: false,
            message: replaced.message,
            matches: [],
            totalRounds: 0,
          };
        }

        return {
          success: true,
          message: `Reta reprogramada de forma atómica. ${replaced.inserted} partidos en ${totalRoundsPreview} rondas.`,
          matches,
          totalRounds: totalRoundsPreview,
        };
      }

      // Primera escritura: confirmación + insert (no hay delete; no hay hueco parcial).
      const okFirst = window.confirm(
        `Preview válido: ${matches.length} partidos en ${totalRoundsPreview} rondas ` +
          `(${pairs.length} parejas, ${courts} canchas).\n\n¿Guardar este calendario en Supabase?`
      );
      if (!okFirst) {
        return {
          success: false,
          message:
            "Preview cancelado: no se escribió nada en la base de datos.",
          matches,
          totalRounds: totalRoundsPreview,
        };
      }

      const createdMatches = await createMatchesBulk(bulkRows);
      const expectedMatches = (pairs.length * (pairs.length - 1)) / 2;

      debugLog("[circle-rr] torneo programado:", {
        partidosCreados: createdMatches.length,
        totalRondas: totalRoundsPreview,
        partidosEsperados: expectedMatches,
      });

      if (createdMatches.length !== expectedMatches) {
        console.error(
          `❌ ADVERTENCIA: Se crearon ${createdMatches.length} partidos pero se esperaban ${expectedMatches}`
        );
      }

      return {
        success: true,
        message: `Reta programada exitosamente. ${createdMatches.length} partidos distribuidos en ${totalRoundsPreview} rondas`,
        matches,
        totalRounds: totalRoundsPreview,
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

      const matches = this.generateTeamsSchedule(pairs, courts, teamsCount, pairToTeam);
      if (matches.length === 0) {
        return {
          success: false,
          message: "No se pudieron generar partidos por equipos",
          matches: [],
          totalRounds: 0,
        };
      }

      const existingMatches = await getMatches(tournamentId);
      const existingGames = await getTournamentGames(tournamentId);
      const results = inspectTournamentResults(existingMatches, existingGames);
      if (results.scoredMatchIds.length > 0) {
        const plan = buildResultsProtectionMessage(results);
        console.warn("[circle-rr-teams] regeneración bloqueada:\n" + plan);
        return {
          success: false,
          message: plan,
          matches: [],
          totalRounds: 0,
        };
      }

      const totalRounds = Math.max(...matches.map((m) => m.round));
      const bulkRows = toBulkMatchRows(tournamentId, matches);

      if (existingMatches.length > 0) {
        downloadScheduleBackupJson(tournamentId, existingMatches);
        const ok = window.confirm(
          `Respaldo exportado (${existingMatches.length} partidos sin marcador). ¿Reemplazar calendario de equipos de forma atómica?`
        );
        if (!ok) {
          return {
            success: false,
            message:
              "Operación cancelada: se conservó el calendario actual (respaldo JSON exportado).",
            matches: [],
            totalRounds: 0,
          };
        }
        const replaced = await replaceTournamentMatchesIfUnscored(
          tournamentId,
          bulkRows
        );
        if (!replaced.ok) {
          return {
            success: false,
            message: replaced.message,
            matches: [],
            totalRounds: 0,
          };
        }
        return {
          success: true,
          message: `Reta por equipos reprogramada de forma atómica. ${replaced.inserted} partidos en ${totalRounds} rondas.`,
          matches,
          totalRounds,
        };
      }

      const createdMatches = await createMatchesBulk(bulkRows);
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
