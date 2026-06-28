import type {
  AmericanoMatch,
  AmericanoPlayer,
  AmericanoRound,
  PartnerMatrix,
  RivalMatrix,
} from "./db/types";

/** Pesos de costo para optimizar cada ronda (rotación americana equilibrada). */
const COST = {
  PARTNER_REPEAT: 1000,
  BENCH_REPEAT: 500,
  RIVAL_REPEAT: 100,
  COURT_REPEAT: 10,
} as const;

const MAX_EXACT_ACTIVE = 12;
const MONTE_CARLO_TRIALS = 600;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Baraja determinista por semilla (misma semilla → mismo orden). */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = Math.abs(Math.floor(seed)) || 1;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function initializeMatrix(players: AmericanoPlayer[]): PartnerMatrix {
  const matrix: PartnerMatrix = {};
  players.forEach((playerA) => {
    matrix[playerA.id] = {};
    players.forEach((playerB) => {
      matrix[playerA.id][playerB.id] = 0;
    });
  });
  return matrix;
}

function matrixCount(
  matrix: PartnerMatrix,
  aId: string,
  bId: string
): number {
  if (aId === bId) return 0;
  return matrix[aId]?.[bId] ?? 0;
}

export function updateMatrices(
  match: AmericanoMatch,
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
): void {
  const [a1, a2] = match.teamA;
  const [b1, b2] = match.teamB;

  partnerMatrix[a1.id][a2.id] += 1;
  partnerMatrix[a2.id][a1.id] += 1;
  partnerMatrix[b1.id][b2.id] += 1;
  partnerMatrix[b2.id][b1.id] += 1;

  const rivalsA = [b1, b2];
  const rivalsB = [a1, a2];
  [a1, a2].forEach((p) => {
    rivalsA.forEach((r) => {
      rivalMatrix[p.id][r.id] += 1;
      rivalMatrix[r.id][p.id] += 1;
    });
  });
  [b1, b2].forEach((p) => {
    rivalsB.forEach((r) => {
      rivalMatrix[p.id][r.id] += 1;
      rivalMatrix[r.id][p.id] += 1;
    });
  });
}

/** Matrices solo desde partidos con marcador cerrado (para costos históricos). */
export function buildMatricesFromScoredRounds(
  allPlayers: AmericanoPlayer[],
  rounds: AmericanoRound[]
): { partnerMatrix: PartnerMatrix; rivalMatrix: RivalMatrix } {
  const partnerMatrix = initializeMatrix(allPlayers);
  const rivalMatrix = initializeMatrix(allPlayers);
  for (const round of rounds) {
    for (const match of round.matches) {
      if (
        typeof match.scoreA === "number" &&
        typeof match.scoreB === "number" &&
        !Number.isNaN(match.scoreA) &&
        !Number.isNaN(match.scoreB) &&
        match.scoreA >= 0 &&
        match.scoreB >= 0
      ) {
        updateMatrices(match, partnerMatrix, rivalMatrix);
      }
    }
  }
  return { partnerMatrix, rivalMatrix };
}

/** Veces que cada jugador jugó en cada cancha (rondas previas). */
export function buildCourtUsageFromRounds(
  rounds: AmericanoRound[]
): Map<string, Map<number, number>> {
  const usage = new Map<string, Map<number, number>>();
  for (const round of rounds) {
    for (const match of round.matches) {
      const court = match.court;
      if (!court || court < 1) continue;
      for (const p of [
        match.teamA[0],
        match.teamA[1],
        match.teamB[0],
        match.teamB[1],
      ]) {
        let courts = usage.get(p.id);
        if (!courts) {
          courts = new Map();
          usage.set(p.id, courts);
        }
        courts.set(court, (courts.get(court) ?? 0) + 1);
      }
    }
  }
  return usage;
}

function pairingsForFour(
  group: AmericanoPlayer[]
): Array<{ teamA: [AmericanoPlayer, AmericanoPlayer]; teamB: [AmericanoPlayer, AmericanoPlayer] }> {
  const [a, b, c, d] = group;
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
}

function matchPairingCost(
  teamA: [AmericanoPlayer, AmericanoPlayer],
  teamB: [AmericanoPlayer, AmericanoPlayer],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
): number {
  let cost = 0;
  cost +=
    COST.PARTNER_REPEAT *
    (matrixCount(partnerMatrix, teamA[0].id, teamA[1].id) +
      matrixCount(partnerMatrix, teamB[0].id, teamB[1].id));

  for (const a of teamA) {
    for (const b of teamB) {
      cost += COST.RIVAL_REPEAT * matrixCount(rivalMatrix, a.id, b.id);
    }
  }
  return cost;
}

function combinationsOfSize<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  if (size === 1) return items.map((x) => [x]);
  const out: T[][] = [];
  for (let i = 0; i <= items.length - size; i += 1) {
    const head = items[i];
    for (const tail of combinationsOfSize(items.slice(i + 1), size - 1)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}

/** Grupos de 4 que incluyen al primer jugador (evita particiones duplicadas). */
function combinationsIncludingFirst(
  remaining: AmericanoPlayer[]
): AmericanoPlayer[][] {
  if (remaining.length < 4) return [];
  const [first, ...rest] = remaining;
  return combinationsOfSize(rest, 3).map((combo) => [first, ...combo]);
}

function benchSelectionCost(
  bench: AmericanoPlayer[],
  lastBenchPlayerIds: Set<string>
): number {
  let cost = 0;
  for (const p of bench) {
    if (lastBenchPlayerIds.has(p.id)) {
      cost += COST.BENCH_REPEAT;
    }
    cost -= p.stats.roundsOnBench * 2;
  }
  return cost;
}

/**
 * Banquillo rotativo: evita descanso consecutivo y reparte descansos entre todos.
 */
export function selectBenchPlayers(
  players: AmericanoPlayer[],
  benchCount: number,
  lastBenchPlayerIds: Set<string>
): AmericanoPlayer[] {
  if (benchCount <= 0 || players.length === 0) return [];

  const candidates = enumerateBenchCandidates(players, benchCount);
  let best = candidates[0] ?? [];
  let bestCost = Infinity;

  for (const bench of candidates) {
    const cost = benchSelectionCost(bench, lastBenchPlayerIds);
    if (cost < bestCost) {
      bestCost = cost;
      best = bench;
    }
  }
  return best;
}

function enumerateBenchCandidates(
  players: AmericanoPlayer[],
  benchCount: number
): AmericanoPlayer[][] {
  if (benchCount <= 0) return [[]];
  if (benchCount >= players.length) return [players];

  const combos = combinationsOfSize(players, benchCount);
  if (combos.length <= 80) return combos;

  const sorted = [...players].sort((a, b) => {
    if (a.stats.roundsOnBench !== b.stats.roundsOnBench) {
      return a.stats.roundsOnBench - b.stats.roundsOnBench;
    }
    if (a.stats.gamesPlayed !== b.stats.gamesPlayed) {
      return a.stats.gamesPlayed - b.stats.gamesPlayed;
    }
    return a.id.localeCompare(b.id);
  });

  const out: AmericanoPlayer[][] = [];
  out.push(sorted.slice(0, benchCount));
  out.push(sorted.slice(-benchCount));
  for (let t = 0; t < 40; t += 1) {
    out.push(shuffle(players).slice(0, benchCount));
  }
  return out;
}

function assignCourtsWithMinimalCost(
  matches: AmericanoMatch[],
  configuredCourts: number,
  roundNumber: number,
  courtUsage: Map<string, Map<number, number>>
): AmericanoMatch[] {
  const n = matches.length;
  if (n === 0) return matches;

  const effectiveCourts = Math.min(
    Math.max(1, Math.floor(configuredCourts) || 1),
    n
  );
  const courtLabels = Array.from({ length: n }, (_, i) => (i % effectiveCourts) + 1);

  const permute = (arr: number[]): number[][] => {
    if (arr.length <= 1) return [arr];
    const perms: number[][] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of permute(rest)) {
        perms.push([arr[i], ...p]);
      }
    }
    return perms;
  };

  const courtCostForAssignment = (assignment: number[]): number => {
    let cost = 0;
    matches.forEach((match, idx) => {
      const court = assignment[idx];
      for (const p of [
        match.teamA[0],
        match.teamA[1],
        match.teamB[0],
        match.teamB[1],
      ]) {
        const prev = courtUsage.get(p.id)?.get(court) ?? 0;
        cost += COST.COURT_REPEAT * prev;
      }
    });
    return cost;
  };

  let bestAssignment = courtLabels;
  let bestCost = courtCostForAssignment(courtLabels);

  const permutations =
    n <= 5 ? permute(courtLabels) : [courtLabels];
  if (n > 5) {
    for (let offset = 0; offset < effectiveCourts; offset += 1) {
      permutations.push(
        Array.from(
          { length: n },
          (_, i) => ((i + offset + roundNumber - 1) % effectiveCourts) + 1
        )
      );
    }
  }

  for (const assignment of permutations) {
    const cost = courtCostForAssignment(assignment);
    if (cost < bestCost) {
      bestCost = cost;
      bestAssignment = assignment;
    }
  }

  return matches.map((match, idx) => ({
    ...match,
    court: bestAssignment[idx],
    id: `americano-r${roundNumber}-m${idx + 1}-c${bestAssignment[idx]}`,
  }));
}

function searchBestPartition(
  remaining: AmericanoPlayer[],
  built: AmericanoMatch[],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix,
  best: { cost: number; matches: AmericanoMatch[] },
  roundSeed: number
): void {
  if (remaining.length === 0) {
    const cost = sumPairingCost(built, partnerMatrix, rivalMatrix);
    if (cost < best.cost) {
      best.cost = cost;
      best.matches = built;
    }
    return;
  }

  if (remaining.length % 4 !== 0) return;

  const sorted = seededShuffle(remaining, roundSeed + remaining.length * 17);
  for (const group of combinationsIncludingFirst(sorted)) {
    const groupSet = new Set(group.map((p) => p.id));
    const rest = sorted.filter((p) => !groupSet.has(p.id));

    let bestPairing = pairingsForFour(group)[0];
    let bestPairCost = Infinity;
    for (const pairing of pairingsForFour(group)) {
      const c = matchPairingCost(
        pairing.teamA,
        pairing.teamB,
        partnerMatrix,
        rivalMatrix
      );
      if (c < bestPairCost) {
        bestPairCost = c;
        bestPairing = pairing;
      }
    }

    const partialCost = sumPairingCost(built, partnerMatrix, rivalMatrix) + bestPairCost;
    if (partialCost >= best.cost) continue;

    const match: AmericanoMatch = {
      id: "",
      court: 0,
      teamA: bestPairing.teamA,
      teamB: bestPairing.teamB,
    };

    searchBestPartition(
      rest,
      [...built, match],
      partnerMatrix,
      rivalMatrix,
      best,
      roundSeed + group.length
    );
  }
}

function sumPairingCost(
  matches: AmericanoMatch[],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
): number {
  return matches.reduce(
    (sum, m) =>
      sum + matchPairingCost(m.teamA, m.teamB, partnerMatrix, rivalMatrix),
    0
  );
}

function monteCarloPartition(
  activePlayers: AmericanoPlayer[],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix,
  roundNumber: number
): AmericanoMatch[] {
  let bestMatches: AmericanoMatch[] = [];
  let bestCost = Infinity;

  for (let t = 0; t < MONTE_CARLO_TRIALS; t += 1) {
    const shuffled = seededShuffle(activePlayers, roundNumber * 1009 + t * 9176);
    const matches: AmericanoMatch[] = [];

    for (let i = 0; i < shuffled.length; i += 4) {
      const group = shuffled.slice(i, i + 4);
      if (group.length < 4) break;

      let bestPairing = pairingsForFour(group)[0];
      let bestPairCost = Infinity;
      for (const pairing of pairingsForFour(group)) {
        const c = matchPairingCost(
          pairing.teamA,
          pairing.teamB,
          partnerMatrix,
          rivalMatrix
        );
        if (c < bestPairCost) {
          bestPairCost = c;
          bestPairing = pairing;
        }
      }
      matches.push({
        id: "",
        court: 0,
        teamA: bestPairing.teamA,
        teamB: bestPairing.teamB,
      });
    }

    const cost = sumPairingCost(matches, partnerMatrix, rivalMatrix);
    if (cost < bestCost) {
      bestCost = cost;
      bestMatches = matches;
    }
  }

  return bestMatches;
}

function buildMatchesForActivePlayers(
  activePlayers: AmericanoPlayer[],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix,
  roundNumber: number
): AmericanoMatch[] {
  if (activePlayers.length === 0) return [];
  if (activePlayers.length % 4 !== 0) return [];

  if (activePlayers.length <= MAX_EXACT_ACTIVE) {
    const best = { cost: Infinity, matches: [] as AmericanoMatch[] };
    searchBestPartition(
      activePlayers,
      [],
      partnerMatrix,
      rivalMatrix,
      best,
      roundNumber
    );
    if (best.matches.length > 0) return best.matches;
  }

  return monteCarloPartition(activePlayers, partnerMatrix, rivalMatrix, roundNumber);
}

export interface AmericanoRoundValidation {
  ok: boolean;
  errors: string[];
  partnerRepeatPairs: number;
  rivalRepeatPairs: number;
}

/** Validaciones de integridad tras generar una ronda. */
export function validateAmericanoRound(
  round: AmericanoRound,
  allPlayers: AmericanoPlayer[],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
): AmericanoRoundValidation {
  const errors: string[] = [];
  const expectedBench = allPlayers.length % 4;
  const playingIds = new Set<string>();
  let partnerRepeats = 0;
  let rivalRepeats = 0;

  if (round.benchPlayers.length !== expectedBench) {
    errors.push(
      `Banquillo incorrecto: esperado ${expectedBench}, hay ${round.benchPlayers.length}.`
    );
  }

  const expectedMatches = Math.floor(
    (allPlayers.length - expectedBench) / 4
  );
  if (round.matches.length !== expectedMatches) {
    errors.push(
      `Partidos incorrectos: esperado ${expectedMatches}, hay ${round.matches.length}.`
    );
  }

  for (const p of round.benchPlayers) {
    if (playingIds.has(p.id)) {
      errors.push(`Jugador en banquillo y en pista: ${p.name}`);
    }
    playingIds.add(p.id);
  }

  for (const match of round.matches) {
    for (const p of [
      match.teamA[0],
      match.teamA[1],
      match.teamB[0],
      match.teamB[1],
    ]) {
      if (playingIds.has(p.id)) {
        errors.push(`Jugador repetido en la misma ronda: ${p.name}`);
      }
      playingIds.add(p.id);
    }

    if (
      matrixCount(partnerMatrix, match.teamA[0].id, match.teamA[1].id) > 0
    ) {
      partnerRepeats += 1;
    }
    if (
      matrixCount(partnerMatrix, match.teamB[0].id, match.teamB[1].id) > 0
    ) {
      partnerRepeats += 1;
    }

    for (const a of match.teamA) {
      for (const b of match.teamB) {
        if (matrixCount(rivalMatrix, a.id, b.id) > 0) {
          rivalRepeats += 1;
        }
      }
    }
  }

  if (playingIds.size + round.benchPlayers.length !== allPlayers.length) {
    errors.push("No todos los jugadores están asignados en la ronda.");
  }

  return {
    ok: errors.length === 0,
    errors,
    partnerRepeatPairs: partnerRepeats,
    rivalRepeatPairs: rivalRepeats,
  };
}

export interface GenerateAmericanoRoundParams {
  allPlayers: AmericanoPlayer[];
  roundNumber: number;
  totalRounds: number;
  courts: number;
  partnerMatrix: PartnerMatrix;
  rivalMatrix?: RivalMatrix;
  lastBenchPlayerIds: Set<string>;
  /** Rondas ya jugadas (con o sin marcador) para rotación de canchas. */
  priorRounds?: AmericanoRound[];
  /** Solo para construir matrices de costo; NO se usa ranking para emparejar. */
  scoredRounds?: AmericanoRound[];
}

/**
 * Genera una ronda de Reta Pádel Americano: rotación equilibrada por costo.
 * El ranking acumulado no influye en los emparejamientos.
 */
export function generateAmericanoRound(
  params: GenerateAmericanoRoundParams
): AmericanoRound {
  const {
    allPlayers,
    roundNumber,
    courts,
    partnerMatrix,
    lastBenchPlayerIds,
    priorRounds = [],
    scoredRounds = [],
  } = params;

  if (allPlayers.length < 4) {
    throw new Error("Americano requiere al menos 4 jugadores.");
  }

  const rivalMatrix =
    params.rivalMatrix ??
    buildMatricesFromScoredRounds(allPlayers, scoredRounds).rivalMatrix;

  const benchCount = allPlayers.length % 4;
  const courtUsage = buildCourtUsageFromRounds(priorRounds);

  const benchCandidates = enumerateBenchCandidates(allPlayers, benchCount);
  let bestBench: AmericanoPlayer[] = [];
  let bestMatches: AmericanoMatch[] = [];
  let bestTotalCost = Infinity;

  for (const bench of benchCandidates) {
    const benchIds = new Set(bench.map((p) => p.id));
    const activePlayers = allPlayers.filter((p) => !benchIds.has(p.id));
    const matches = buildMatchesForActivePlayers(
      activePlayers,
      partnerMatrix,
      rivalMatrix,
      roundNumber
    );

    const benchCost = benchSelectionCost(bench, lastBenchPlayerIds);
    const pairingCost = sumPairingCost(matches, partnerMatrix, rivalMatrix);
    const totalCost = benchCost + pairingCost;

    if (totalCost < bestTotalCost && matches.length > 0) {
      bestTotalCost = totalCost;
      bestBench = bench;
      bestMatches = matches;
    }
  }

  if (bestMatches.length === 0 && benchCount === 0) {
    bestMatches = buildMatchesForActivePlayers(
      allPlayers,
      partnerMatrix,
      rivalMatrix,
      roundNumber
    );
  }

  const withCourts = assignCourtsWithMinimalCost(
    bestMatches,
    courts,
    roundNumber,
    courtUsage
  );

  const round: AmericanoRound = {
    roundNumber,
    phase: 1,
    matches: withCourts,
    benchPlayers: bestBench,
  };

  const validation = validateAmericanoRound(
    round,
    allPlayers,
    partnerMatrix,
    rivalMatrix
  );
  if (!validation.ok) {
    console.warn("[americano] validación de ronda:", validation.errors);
  }

  return round;
}
