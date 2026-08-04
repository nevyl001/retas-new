/**
 * Equipos con alineación dinámica — capa nueva y separada del scheduler
 * clásico (`CircleRoundRobinScheduler`) y de `standingsUtils.computeTeamStandings`.
 * No modifica ninguno de los dos; los reutiliza donde corresponde
 * (`computePairsWithStats` para leer resultados ya guardados;
 * `CircleRoundRobinScheduler.scheduleTournamentTeams` para crear los
 * partidos del Round Robin inicial, ver `useTournamentActions.tsx`).
 *
 * Modelo deportivo (confirmado por el organizador, 2026-08-04):
 * - Si cada equipo tiene `pairsPerTeam` parejas originales, primero se juega
 *   un Round Robin COMPLETO entre esas parejas originales: dura exactamente
 *   `pairsPerTeam` rondas, con `pairsPerTeam` partidos simultáneos por
 *   ronda, y cada pareja de un equipo enfrenta a cada pareja del rival
 *   exactamente una vez.
 * - Recién después de completar esa fase inicial empieza la rotación
 *   dinámica: desde la ronda `pairsPerTeam + 1` en adelante, cada ronda
 *   adicional es su propio "bloque" de generación — se recalcula el
 *   rendimiento acumulado, se reorganizan las parejas dentro de cada
 *   equipo, y se genera solo esa ronda (no bloques de N rondas).
 * - `totalRounds` es libre (≥ `pairsPerTeam`), sin exigir múltiplos de nada.
 * - Un jugador jamás cambia de equipo; solo las parejas dentro de un equipo
 *   se reorganizan. El balanceo usa rendimiento dentro de la reta (games a
 *   favor, diferencia, partidos ganados) — nunca rating/ranking global.
 * - Toda la generación es determinista: recargar la página no puede cambiar
 *   una alineación ya calculada.
 */
import type { Pair, Match, Game } from "../database";
import {
  computePairsWithStats,
  type PairWithStats,
  type TeamStandingRow,
} from "../standingsUtils";

// ---------------------------------------------------------------------------
// Rendimiento por jugador
// ---------------------------------------------------------------------------

export interface PlayerPerformance {
  playerId: string;
  gamesFor: number;
  gamesAgainst: number;
  gameDifference: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
}

function emptyPerformance(playerId: string): PlayerPerformance {
  return {
    playerId,
    gamesFor: 0,
    gamesAgainst: 0,
    gameDifference: 0,
    matchesWon: 0,
    matchesLost: 0,
    matchesDrawn: 0,
  };
}

/**
 * Rendimiento acumulado por jugador a partir de las parejas (reales,
 * incluyendo las temporales de rondas dinámicas) que ha integrado en la
 * reta. `pair.points`/`pair.pointsReceived` en `PairWithStats` ya son
 * "games a favor/en contra" (juegos, no sets); `pg`/`pp`/`pe` son partidos
 * ganados/perdidos/empatados — ver `standingsUtils.computePairsWithStats`.
 */
export function computePlayerPerformance(
  pairsWithStats: PairWithStats[]
): Map<string, PlayerPerformance> {
  const perf = new Map<string, PlayerPerformance>();
  const ensure = (playerId: string): PlayerPerformance => {
    let p = perf.get(playerId);
    if (!p) {
      p = emptyPerformance(playerId);
      perf.set(playerId, p);
    }
    return p;
  };
  pairsWithStats.forEach((pair) => {
    [pair.player1_id, pair.player2_id].forEach((playerId) => {
      if (!playerId) return;
      const p = ensure(playerId);
      p.gamesFor += pair.points;
      p.gamesAgainst += pair.pointsReceived;
      p.gameDifference = p.gamesFor - p.gamesAgainst;
      p.matchesWon += pair.pg;
      p.matchesLost += pair.pp;
      p.matchesDrawn += pair.pe ?? 0;
    });
  });
  return perf;
}

/**
 * Orden de rendimiento pedido por el organizador: games a favor, luego
 * diferencia de games, luego partidos ganados. `stableSeedOf` rompe empates
 * de forma determinista (nunca aleatorio) — debe basarse en un orden fijo
 * (p.ej. el id del jugador ordenado alfabéticamente), no en el orden de la
 * alineación actual, para que el resultado no cambie entre rondas ni con F5.
 */
export function comparePlayerPerformance(
  a: PlayerPerformance,
  b: PlayerPerformance,
  stableSeedOf: (playerId: string) => number
): number {
  return (
    b.gamesFor - a.gamesFor ||
    b.gameDifference - a.gameDifference ||
    b.matchesWon - a.matchesWon ||
    stableSeedOf(a.playerId) - stableSeedOf(b.playerId)
  );
}

/**
 * Convierte el rendimiento multi-criterio en un escalar sumable para
 * comparar la "fuerza" de una pareja candidata. Los divisores mantienen el
 * mismo orden de prioridad que `comparePlayerPerformance` (games a favor
 * domina, luego diferencia, luego partidos ganados) sin perder la magnitud
 * real de games a favor, que es lo que pide el spec para el desbalance.
 */
function performanceScore(perf: PlayerPerformance | undefined): number {
  if (!perf) return 0;
  return perf.gamesFor * 1_000_000 + perf.gameDifference * 1_000 + perf.matchesWon;
}

function buildStableSeedOf(players: string[]): (id: string) => number {
  const sorted = [...players].sort();
  const index = new Map(sorted.map((id, i) => [id, i]));
  return (id: string) => index.get(id) ?? 0;
}

// ---------------------------------------------------------------------------
// Etapas: Round Robin inicial (parejas originales) seguido de rotaciones
// ronda a ronda.
// ---------------------------------------------------------------------------

export type DynamicStage = "initial_round_robin" | "dynamic_round";

/**
 * Bloque 1 = rondas 1..pairsPerTeam (Round Robin de las parejas originales).
 * Bloque N (N>=2) = ronda (pairsPerTeam + N - 1), una sola ronda.
 * Ej. con 3 parejas/equipo: bloque 1 = rondas 1-3, bloque 2 = ronda 4,
 * bloque 3 = ronda 5.
 */
export function resolveDynamicBlockRoundRange(
  blockNumber: number,
  pairsPerTeam: number
): { roundStart: number; roundEnd: number; stage: DynamicStage } {
  if (blockNumber <= 1) {
    return { roundStart: 1, roundEnd: pairsPerTeam, stage: "initial_round_robin" };
  }
  const round = pairsPerTeam + (blockNumber - 1);
  return { roundStart: round, roundEnd: round, stage: "dynamic_round" };
}

/**
 * Total de bloques que requiere `totalRounds` dado `pairsPerTeam`: 1 (el
 * Round Robin inicial) si `totalRounds <= pairsPerTeam`, más 1 bloque por
 * cada ronda dinámica adicional. No exige que `totalRounds` sea múltiplo de
 * nada — solo que sea >= pairsPerTeam (validado aparte en la UI).
 */
export function resolveTotalDynamicBlocks(
  totalRounds: number,
  pairsPerTeam: number
): number {
  return totalRounds <= pairsPerTeam ? 1 : 1 + (totalRounds - pairsPerTeam);
}

// ---------------------------------------------------------------------------
// Particiones de 2N jugadores en N parejas (greedy + búsqueda local)
// ---------------------------------------------------------------------------

export type PlayerPair = [string, string];

function pairKey(pair: PlayerPair): string {
  return [...pair].sort().join("+");
}

function partitionKeyOf(pairs: PlayerPair[]): string {
  return pairs.map(pairKey).sort().join("|");
}

function pairStrength(
  pair: PlayerPair,
  performance: Map<string, PlayerPerformance>
): number {
  return performanceScore(performance.get(pair[0])) + performanceScore(performance.get(pair[1]));
}

interface PartitionCost {
  /** Cuántas parejas de esta partición son EXACTAMENTE la misma pareja de la ronda inmediatamente anterior. */
  immediateRepeats: number;
  /** Suma de veces que cada pareja de esta partición ya fue compañera en rondas pasadas. */
  totalPartnerRepeats: number;
  /** Spread entre la pareja más fuerte y la más débil del equipo (desbalance interno). */
  imbalanceSpread: number;
  /** Desempate final determinista. */
  key: string;
}

function computePartitionCost(
  pairs: PlayerPair[],
  performance: Map<string, PlayerPerformance>,
  partnerCounts: Map<string, number>,
  previousRoundPairKeys: Set<string>
): PartitionCost {
  let immediateRepeats = 0;
  let totalPartnerRepeats = 0;
  const strengths: number[] = [];
  pairs.forEach((pair) => {
    const key = pairKey(pair);
    totalPartnerRepeats += partnerCounts.get(key) ?? 0;
    if (previousRoundPairKeys.has(key)) immediateRepeats += 1;
    strengths.push(pairStrength(pair, performance));
  });
  const imbalanceSpread =
    strengths.length > 0 ? Math.max(...strengths) - Math.min(...strengths) : 0;
  return {
    immediateRepeats,
    totalPartnerRepeats,
    imbalanceSpread,
    key: partitionKeyOf(pairs),
  };
}

function comparePartitionCost(a: PartitionCost, b: PartitionCost): number {
  return (
    a.immediateRepeats - b.immediateRepeats ||
    a.totalPartnerRepeats - b.totalPartnerRepeats ||
    a.imbalanceSpread - b.imbalanceSpread ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

function buildBestWorstPairing(sortedByPerformanceDesc: string[]): PlayerPair[] {
  const pairs: PlayerPair[] = [];
  let lo = 0;
  let hi = sortedByPerformanceDesc.length - 1;
  while (lo < hi) {
    pairs.push([sortedByPerformanceDesc[lo], sortedByPerformanceDesc[hi]]);
    lo += 1;
    hi -= 1;
  }
  return pairs;
}

/**
 * Búsqueda local determinista (2-opt), evita fuerza bruta sobre todas las
 * particiones posibles (crece factorialmente con el tamaño del equipo: 3
 * para 4 jugadores, 15 para 6, 105 para 8, 945 para 10...). En cada pasada
 * evalúa, para cada par de parejas (i, j) de la partición actual, las 2
 * recombinaciones posibles de sus 4 jugadores — (a,b)+(c,d) -> (a,c)+(b,d) o
 * (a,d)+(b,c) — y aplica la primera que mejore estrictamente el costo total
 * (repetición inmediata > repeticiones históricas > desbalance > desempate
 * por clave). Repite hasta que una pasada completa no mejore nada o se
 * alcance el tope de pasadas (garantiza terminación).
 */
function localSearchImprove(
  initialPairs: PlayerPair[],
  performance: Map<string, PlayerPerformance>,
  partnerCounts: Map<string, number>,
  previousRoundPairKeys: Set<string>
): PlayerPair[] {
  let current = initialPairs.map((p): PlayerPair => [p[0], p[1]]);
  let currentCost = computePartitionCost(
    current,
    performance,
    partnerCounts,
    previousRoundPairKeys
  );
  const MAX_PASSES = 25;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improvedThisPass = false;
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const [a, b] = current[i];
        const [c, d] = current[j];
        const recombinations: Array<[PlayerPair, PlayerPair]> = [
          [
            [a, c],
            [b, d],
          ],
          [
            [a, d],
            [b, c],
          ],
        ];
        for (const [newI, newJ] of recombinations) {
          const trial = current.slice();
          trial[i] = newI;
          trial[j] = newJ;
          const trialCost = computePartitionCost(
            trial,
            performance,
            partnerCounts,
            previousRoundPairKeys
          );
          if (comparePartitionCost(trialCost, currentCost) < 0) {
            current = trial;
            currentCost = trialCost;
            improvedThisPass = true;
          }
        }
      }
    }
    if (!improvedThisPass) break;
  }
  return current;
}

export interface TeamPairingResult {
  /** N parejas del equipo, orden estable (ordenadas por clave canónica). */
  pairs: PlayerPair[];
  partitionKey: string;
  /** Spread de fuerza entre la pareja más fuerte y la más débil del equipo. */
  imbalance: number;
  wasImmediateRepeat: boolean;
}

/**
 * Forma N parejas balanceadas dentro de un equipo de 2N jugadores.
 * Determinista: mismo input -> mismo output siempre (recargar la página no
 * cambia la alineación).
 *
 * Estrategia (evita fuerza bruta sobre todas las particiones posibles):
 * 1. Ordena a los jugadores por rendimiento (games a favor, diferencia,
 *    partidos ganados, desempate por id).
 * 2. Forma una partición base "mejor + peor, segundo + penúltimo, ..."
 *    (minimiza el desbalance de fuerza entre parejas por construcción).
 * 3. Mejora esa base con una búsqueda local 2-opt que prioriza, en orden:
 *    no repetir la pareja de la ronda inmediatamente anterior > minimizar
 *    repeticiones históricas de compañero > minimizar el desbalance de
 *    fuerza entre parejas > desempate determinista.
 */
export function selectBalancedPairsForTeam(params: {
  players: string[];
  performance: Map<string, PlayerPerformance>;
  /** Veces que cada pareja canónica ya fue compañera (incluye la pareja original). */
  partnerCounts: Map<string, number>;
  /** Claves canónicas de las parejas de la ronda inmediatamente anterior de este equipo. */
  previousRoundPairKeys: string[];
}): TeamPairingResult {
  const { players, performance, partnerCounts, previousRoundPairKeys } = params;
  if (players.length < 2 || players.length % 2 !== 0) {
    throw new Error(
      `selectBalancedPairsForTeam requiere una cantidad par de jugadores >= 2 (recibidos: ${players.length})`
    );
  }
  const stableSeedOf = buildStableSeedOf(players);
  const sorted = [...players].sort((a, b) =>
    comparePlayerPerformance(
      performance.get(a) ?? emptyPerformance(a),
      performance.get(b) ?? emptyPerformance(b),
      stableSeedOf
    )
  );
  const baseline = buildBestWorstPairing(sorted);
  const previousSet = new Set(previousRoundPairKeys);
  const improved = localSearchImprove(baseline, performance, partnerCounts, previousSet);
  const orderedPairs = [...improved].sort((p1, p2) => {
    const k1 = pairKey(p1);
    const k2 = pairKey(p2);
    return k1 < k2 ? -1 : k1 > k2 ? 1 : 0;
  });
  const finalCost = computePartitionCost(
    orderedPairs,
    performance,
    partnerCounts,
    previousSet
  );
  return {
    pairs: orderedPairs,
    partitionKey: finalCost.key,
    imbalance: finalCost.imbalanceSpread,
    wasImmediateRepeat: finalCost.immediateRepeats > 0,
  };
}

// ---------------------------------------------------------------------------
// Historial (compañeros dentro de un equipo, rivales individuales entre equipos)
// ---------------------------------------------------------------------------

/**
 * Cuenta cuántas veces cada pareja canónica (dentro de un equipo) ya fue
 * compañera, a partir de TODAS las filas reales de `pairs` de ese equipo
 * (incluye la pareja original del Round Robin inicial y cada rotación
 * dinámica ya generada) — cada fila de `pairs` es un evento de "estos 2
 * jugadores fueron compañeros", independientemente de si el partido ya se
 * jugó.
 */
export function computePartnerCounts(
  teamPairs: Pair[]
): Map<string, number> {
  const counts = new Map<string, number>();
  teamPairs.forEach((p) => {
    if (!p.player1_id || !p.player2_id) return;
    const key = pairKey([p.player1_id, p.player2_id]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function individualOpponentKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

/**
 * Cuenta cuántas veces cada par de jugadores INDIVIDUALES de equipos
 * distintos ya se enfrentó (en cualquier partido, del Round Robin inicial o
 * de rondas dinámicas), para minimizar rivales repetidos al cruzar las
 * nuevas parejas de cada equipo.
 */
export function computeIndividualOpponentCounts(
  pairs: Pair[],
  matches: Match[]
): Map<string, number> {
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const counts = new Map<string, number>();
  matches.forEach((m) => {
    const pair1 = pairById.get(m.pair1_id);
    const pair2 = pairById.get(m.pair2_id);
    if (!pair1 || !pair2) return;
    const side1 = [pair1.player1_id, pair1.player2_id].filter(Boolean);
    const side2 = [pair2.player1_id, pair2.player2_id].filter(Boolean);
    side1.forEach((a) => {
      side2.forEach((b) => {
        const key = individualOpponentKey(a, b);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
  });
  return counts;
}

// ---------------------------------------------------------------------------
// Cruce de partidos
// ---------------------------------------------------------------------------

export interface DynamicCrossMatch {
  /** Ronda global (1-based) dentro de toda la reta. */
  round: number;
  court: number;
  teamAPair: PlayerPair;
  teamBPair: PlayerPair;
}

function crossPairOpponentCost(
  teamAPair: PlayerPair,
  teamBPair: PlayerPair,
  opponentCounts: Map<string, number>
): number {
  let cost = 0;
  teamAPair.forEach((a) => {
    teamBPair.forEach((b) => {
      cost += opponentCounts.get(individualOpponentKey(a, b)) ?? 0;
    });
  });
  return cost;
}

/**
 * Empareja las N parejas de un equipo contra las N parejas del rival para
 * UNA ronda, minimizando rivales individuales repetidos. Estrategia
 * determinista (greedy, no Hungarian): procesa las parejas del equipo A en
 * orden fijo (clave canónica ascendente) y, para cada una, asigna la pareja
 * disponible del equipo B con menor costo de encuentros previos entre sus
 * jugadores; desempate determinista por clave canónica de la pareja B. No
 * garantiza el óptimo global, pero sí un resultado reproducible que reduce
 * la repetición de rivales.
 */
export function matchDynamicRoundPairs(params: {
  teamAPairs: PlayerPair[];
  teamBPairs: PlayerPair[];
  opponentCounts: Map<string, number>;
}): Array<{ teamAPair: PlayerPair; teamBPair: PlayerPair }> {
  const { teamAPairs, teamBPairs, opponentCounts } = params;
  if (teamAPairs.length !== teamBPairs.length) {
    throw new Error(
      "matchDynamicRoundPairs requiere la misma cantidad de parejas en ambos equipos."
    );
  }
  const orderedA = [...teamAPairs].sort((p1, p2) => {
    const k1 = pairKey(p1);
    const k2 = pairKey(p2);
    return k1 < k2 ? -1 : k1 > k2 ? 1 : 0;
  });
  const remainingB = [...teamBPairs];
  const assignments: Array<{ teamAPair: PlayerPair; teamBPair: PlayerPair }> = [];
  orderedA.forEach((aPair) => {
    let bestIdx = 0;
    let bestCost = Infinity;
    remainingB.forEach((bPair, idx) => {
      const cost = crossPairOpponentCost(aPair, bPair, opponentCounts);
      const better =
        cost < bestCost ||
        (cost === bestCost && pairKey(bPair) < pairKey(remainingB[bestIdx]));
      if (better) {
        bestCost = cost;
        bestIdx = idx;
      }
    });
    assignments.push({ teamAPair: aPair, teamBPair: remainingB[bestIdx] });
    remainingB.splice(bestIdx, 1);
  });
  return assignments;
}

/**
 * Cruce de una sola ronda dinámica (ronda `pairsPerTeam + 1` en adelante):
 * cada equipo ya trae exactamente N parejas para ESA ronda
 * (`selectBalancedPairsForTeam`); se enfrentan minimizando rivales
 * repetidos (`matchDynamicRoundPairs`). No hay "segunda vuelta" porque es
 * una sola ronda, no un bloque de varias.
 */
export function buildDynamicRoundMatches(
  teamAPairs: PlayerPair[],
  teamBPairs: PlayerPair[],
  opponentCounts: Map<string, number>,
  courts: number,
  round: number
): DynamicCrossMatch[] {
  const assignments = matchDynamicRoundPairs({ teamAPairs, teamBPairs, opponentCounts });
  const safeCourts = Math.max(1, courts);
  return assignments.map((m, idx) => ({
    round,
    court: (idx % safeCourts) + 1,
    teamAPair: m.teamAPair,
    teamBPair: m.teamBPair,
  }));
}

/**
 * Calendario teórico (por índice de pareja, no de jugadores reales) del
 * Round Robin inicial entre `pairsPerTeam` parejas por equipo, con la misma
 * fórmula de rotación que ya usa
 * `CircleRoundRobinScheduler.generateTeamsSchedule` para Equipos clásico
 * (equipo0[i] vs equipo1[(i + r - 1) % pairsPerTeam] en la ronda r) —
 * expuesto para poder verificar por unidad la cobertura completa de cruces
 * sin depender de crear partidos reales ni de importar el scheduler.
 */
export interface InitialRoundRobinIndexMatch {
  round: number;
  teamAPairIndex: number;
  teamBPairIndex: number;
}

export function buildInitialRoundRobinIndexSchedule(
  pairsPerTeam: number
): InitialRoundRobinIndexMatch[] {
  const matches: InitialRoundRobinIndexMatch[] = [];
  for (let r = 1; r <= pairsPerTeam; r++) {
    for (let i = 0; i < pairsPerTeam; i++) {
      matches.push({
        round: r,
        teamAPairIndex: i,
        teamBPairIndex: (i + (r - 1)) % pairsPerTeam,
      });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Plan de bloque completo (parejas de ambos equipos + calendario del bloque)
// ---------------------------------------------------------------------------

export interface DynamicTeamRosterInput {
  teamIndex: number;
  /** Los 2N jugadores fijos de este equipo (jamás cambia entre rondas). */
  players: string[];
  partnerCounts: Map<string, number>;
  previousRoundPairKeys: string[];
}

export interface DynamicLineupBlockPlan {
  blockNumber: number;
  /** Única fuente de verdad de "inicial vs dinámico" -- no duplicar en otro campo. */
  stage: DynamicStage;
  roundStart: number;
  roundEnd: number;
  teamA: { teamIndex: number; lineup: TeamPairingResult };
  teamB: { teamIndex: number; lineup: TeamPairingResult };
  crossMatches: DynamicCrossMatch[];
}

/**
 * Bloque 1: rondas 1..pairsPerTeam con las parejas originales elegidas por
 * el organizador tal cual (no se balancea nada). Los partidos del Round
 * Robin inicial se crean reutilizando
 * `CircleRoundRobinScheduler.scheduleTournamentTeams` (ver
 * `useTournamentActions.tsx`) — `crossMatches` queda vacío aquí a propósito
 * porque no se usa para crear esos partidos, solo para la fotografía de
 * bloques dinámicos (ronda 2 en adelante).
 */
export function buildInitialDynamicLineupBlock(params: {
  pairsPerTeam: number;
  teamA: { teamIndex: number; pairs: PlayerPair[] };
  teamB: { teamIndex: number; pairs: PlayerPair[] };
}): DynamicLineupBlockPlan {
  const { pairsPerTeam, teamA, teamB } = params;
  const { roundStart, roundEnd, stage } = resolveDynamicBlockRoundRange(1, pairsPerTeam);
  const asLineup = (pairs: PlayerPair[]): TeamPairingResult => ({
    pairs,
    partitionKey: partitionKeyOf(pairs),
    imbalance: 0,
    wasImmediateRepeat: false,
  });
  return {
    blockNumber: 1,
    stage,
    roundStart,
    roundEnd,
    teamA: { teamIndex: teamA.teamIndex, lineup: asLineup(teamA.pairs) },
    teamB: { teamIndex: teamB.teamIndex, lineup: asLineup(teamB.pairs) },
    crossMatches: [],
  };
}

/**
 * Bloque N>=2 (ronda `pairsPerTeam + N - 1`, una sola ronda): reorganiza
 * cada equipo por rendimiento acumulado hasta ahora y genera el cruce de
 * esa única ronda. `blockNumber` determina la ronda vía
 * `resolveDynamicBlockRoundRange` — el llamador no decide la numeración.
 */
export function generateDynamicTeamsBlock(params: {
  blockNumber: number;
  pairsPerTeam: number;
  courts: number;
  performance: Map<string, PlayerPerformance>;
  opponentCounts: Map<string, number>;
  teamA: DynamicTeamRosterInput;
  teamB: DynamicTeamRosterInput;
}): DynamicLineupBlockPlan {
  const { blockNumber, pairsPerTeam, courts, performance, opponentCounts, teamA, teamB } =
    params;
  const { roundStart, roundEnd, stage } = resolveDynamicBlockRoundRange(
    blockNumber,
    pairsPerTeam
  );
  const lineupA = selectBalancedPairsForTeam({
    players: teamA.players,
    performance,
    partnerCounts: teamA.partnerCounts,
    previousRoundPairKeys: teamA.previousRoundPairKeys,
  });
  const lineupB = selectBalancedPairsForTeam({
    players: teamB.players,
    performance,
    partnerCounts: teamB.partnerCounts,
    previousRoundPairKeys: teamB.previousRoundPairKeys,
  });
  const crossMatches = buildDynamicRoundMatches(
    lineupA.pairs,
    lineupB.pairs,
    opponentCounts,
    courts,
    roundStart
  );
  return {
    blockNumber,
    stage,
    roundStart,
    roundEnd,
    teamA: { teamIndex: teamA.teamIndex, lineup: lineupA },
    teamB: { teamIndex: teamB.teamIndex, lineup: lineupB },
    crossMatches,
  };
}

// ---------------------------------------------------------------------------
// ¿Se puede generar el siguiente bloque?
// ---------------------------------------------------------------------------

export function canGenerateNextDynamicBlock(params: {
  tournamentFinished: boolean;
  totalRounds: number;
  pairsPerTeam: number;
  currentBlockNumber: number;
  currentBlockMatches: Match[];
  nextBlockAlreadyGenerated: boolean;
}): { canGenerate: boolean; reason?: string } {
  if (params.tournamentFinished) {
    return { canGenerate: false, reason: "tournament_finished" };
  }
  if (params.nextBlockAlreadyGenerated) {
    return { canGenerate: false, reason: "already_generated" };
  }
  const totalBlocks = resolveTotalDynamicBlocks(params.totalRounds, params.pairsPerTeam);
  if (params.currentBlockNumber >= totalBlocks) {
    return { canGenerate: false, reason: "no_more_blocks" };
  }
  if (params.currentBlockMatches.length === 0) {
    return { canGenerate: false, reason: "no_matches" };
  }
  const allFinished = params.currentBlockMatches.every((m) => m.status === "finished");
  if (!allFinished) {
    return { canGenerate: false, reason: "pending_results" };
  }
  return { canGenerate: true };
}

// ---------------------------------------------------------------------------
// Clasificación por equipos (comparador games > diferencia > partidos ganados)
// ---------------------------------------------------------------------------

export interface DynamicTeamStandingRow {
  teamIndex: number;
  name: string;
  gamesFor: number;
  gamesAgainst: number;
  gameDifference: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
}

export function compareDynamicTeamStandings(
  a: DynamicTeamStandingRow,
  b: DynamicTeamStandingRow
): number {
  return (
    b.gamesFor - a.gamesFor ||
    b.gameDifference - a.gameDifference ||
    b.matchesWon - a.matchesWon ||
    a.teamIndex - b.teamIndex
  );
}

/**
 * Clasificación por equipos exclusiva de alineación dinámica: games a favor,
 * diferencia, partidos ganados — nunca puntos de torneo. No toca
 * `standingsUtils.computeTeamStandings` (modo equipos clásico). Suma sobre
 * TODAS las parejas reales de cada equipo (Round Robin inicial + todas las
 * rondas dinámicas), sin importar cuántas parejas tenga cada equipo.
 */
export function computeDynamicTeamStandings(
  pairs: Pair[],
  matches: Match[],
  games: Game[],
  teamConfig: { teamNames: string[]; pairToTeam: Record<string, number> }
): DynamicTeamStandingRow[] | null {
  if (
    !teamConfig?.teamNames?.length ||
    !teamConfig.pairToTeam ||
    Object.keys(teamConfig.pairToTeam).length === 0
  ) {
    return null;
  }
  const pairsWithStats = computePairsWithStats(pairs, matches, games);
  const n = teamConfig.teamNames.length;
  const totals = Array.from({ length: n }, () => ({
    gamesFor: 0,
    gamesAgainst: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
  }));
  pairsWithStats.forEach((pair) => {
    const t = teamConfig.pairToTeam[pair.id];
    if (t == null || t < 0 || t >= n) return;
    totals[t].gamesFor += pair.points;
    totals[t].gamesAgainst += pair.pointsReceived;
    totals[t].matchesPlayed += pair.matchesPlayed;
    totals[t].matchesWon += pair.pg;
    totals[t].matchesLost += pair.pp;
  });
  const rows: DynamicTeamStandingRow[] = totals.map((tot, teamIndex) => ({
    teamIndex,
    name: teamConfig.teamNames[teamIndex] ?? `Equipo ${teamIndex + 1}`,
    gamesFor: tot.gamesFor,
    gamesAgainst: tot.gamesAgainst,
    gameDifference: tot.gamesFor - tot.gamesAgainst,
    matchesPlayed: tot.matchesPlayed,
    matchesWon: tot.matchesWon,
    matchesLost: tot.matchesLost,
  }));
  return [...rows].sort(compareDynamicTeamStandings);
}

/**
 * Adapta `DynamicTeamStandingRow` a la forma `TeamStandingRow` (Equipos
 * clásico) exclusivamente para reutilizar componentes de presentación ya
 * existentes (tabla pública genérica, banner de ganador) que consumen ese
 * shape -- el ORDEN sigue viniendo de `compareDynamicTeamStandings`, nunca
 * del comparador clásico. No se usa para nada que afecte cierre/ranking.
 */
export function toLegacyTeamStandingRows(
  rows: DynamicTeamStandingRow[]
): TeamStandingRow[] {
  return rows.map((r) => ({
    teamIndex: r.teamIndex,
    name: r.name,
    points: r.gamesFor,
    pointsReceived: r.gamesAgainst,
    gamesWon: r.matchesWon,
    gamesLost: r.matchesLost,
    setsWon: r.matchesWon,
    setsLost: r.matchesLost,
    matchesPlayed: r.matchesPlayed,
    pg: r.matchesWon,
    pp: r.matchesLost,
    puntosTorneo: r.gamesFor,
  }));
}

/**
 * Ganador o empate según los 3 criterios exactos del comparador. Solo hay
 * empate real si los DOS primeros equipos coinciden en los 3 criterios — no
 * se inventa un ganador por alfabeto, id o `teamIndex` (ese solo ordena
 * visualmente).
 */
export function resolveDynamicTeamWinner(
  rows: DynamicTeamStandingRow[]
): { winningTeamIndex: number | null; isDraw: boolean } {
  if (rows.length === 0) return { winningTeamIndex: null, isDraw: false };
  if (rows.length === 1) return { winningTeamIndex: rows[0].teamIndex, isDraw: false };
  const [first, second] = rows;
  const tied =
    first.gamesFor === second.gamesFor &&
    first.gameDifference === second.gameDifference &&
    first.matchesWon === second.matchesWon;
  if (tied) return { winningTeamIndex: null, isDraw: true };
  return { winningTeamIndex: first.teamIndex, isDraw: false };
}

// ---------------------------------------------------------------------------
// Elegibilidad en preparación (extraída de RoundRobinPrepWorkspace.tsx para
// que sea testeable como función pura, sin renderizar el componente).
// ---------------------------------------------------------------------------

export interface DynamicLineupsEligibilityResult {
  eligible: boolean;
  reason?: string;
  pairsPerTeam?: number;
}

/**
 * Valida si "Alineación dinámica" puede activarse con la configuración de
 * equipos actual: exactamente 2 equipos, misma cantidad de parejas
 * originales (>=2) en ambos, sin jugadores repetidos, y `courts >=
 * pairsPerTeam`.
 *
 * El requisito de canchas es una LIMITACIÓN TEMPORAL del calendario inicial
 * (reutiliza `CircleRoundRobinScheduler.generateTeamsSchedule`, que solo
 * cubre todos los cruces cuando hay una cancha por pareja -- ver auditoría
 * 2026-08-04), no una regla deportiva del formato.
 */
export function evaluateDynamicLineupsEligibility(params: {
  isTeams: boolean;
  teams: Array<{ teamIndex: number; pairs: Pair[] }> | null;
  allPairs: Pair[];
  courts: number;
}): DynamicLineupsEligibilityResult {
  const { isTeams, teams, allPairs, courts } = params;
  if (!isTeams) return { eligible: false };
  if (!teams || teams.length !== 2) {
    return { eligible: false, reason: "Disponible solo con exactamente 2 equipos." };
  }
  const [a, b] = teams;
  if (a.pairs.length < 2 || a.pairs.length !== b.pairs.length) {
    return {
      eligible: false,
      reason: "Ambos equipos necesitan la misma cantidad de parejas originales (2 o más).",
    };
  }
  const pairsPerTeam = a.pairs.length;
  const allPlayerIds = allPairs.flatMap((p) => [p.player1_id, p.player2_id]);
  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    return { eligible: false, reason: "Hay jugadores repetidos entre las parejas." };
  }
  if (courts < pairsPerTeam) {
    return {
      eligible: false,
      reason: `Para este formato se requiere una cancha por cada pareja de un equipo, porque el calendario inicial necesita que todos los partidos de una ronda se jueguen simultáneamente. Con ${pairsPerTeam} pareja${pairsPerTeam === 1 ? "" : "s"} por equipo se necesitan ${pairsPerTeam} cancha${pairsPerTeam === 1 ? "" : "s"} — hay ${courts} configurada${courts === 1 ? "" : "s"}.`,
    };
  }
  return { eligible: true, pairsPerTeam };
}
