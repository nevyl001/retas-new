import type {
  AmericanoMatch,
  AmericanoPlayer,
  AmericanoRound,
  PartnerMatrix,
  RivalMatrix,
} from "./db/types";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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

function scorePair(
  a: AmericanoPlayer,
  b: AmericanoPlayer,
  partnerMatrix: PartnerMatrix
): number {
  return partnerMatrix[a.id]?.[b.id] ?? 0;
}

/** Suma de veces que A y B fueron compañeros en partidos ya cerrados. */
function partnershipScore(
  teamA: [AmericanoPlayer, AmericanoPlayer],
  teamB: [AmericanoPlayer, AmericanoPlayer],
  partnerMatrix: PartnerMatrix
): number {
  return (
    scorePair(teamA[0], teamA[1], partnerMatrix) +
    scorePair(teamB[0], teamB[1], partnerMatrix)
  );
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

/**
 * Matrices de compañero/rival solo a partir de partidos con marcador cerrado.
 */
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

/**
 * Primera mitad: entre emparejamientos posibles elige al azar entre los que
 * minimizan repeticiones de compañero (si hay empate, aleatorio).
 */
function randomMatchAvoidPartnerRepeats(
  group: AmericanoPlayer[],
  partnerMatrix: PartnerMatrix
): AmericanoMatch {
  const [a, b, c, d] = group;
  const candidates: AmericanoMatch[] = [
    {
      id: "",
      teamA: [a, b],
      teamB: [c, d],
      court: 0,
    },
    {
      id: "",
      teamA: [a, c],
      teamB: [b, d],
      court: 0,
    },
    {
      id: "",
      teamA: [a, d],
      teamB: [b, c],
      court: 0,
    },
  ];
  let best = Infinity;
  for (const cand of candidates) {
    best = Math.min(
      best,
      partnershipScore(cand.teamA, cand.teamB, partnerMatrix)
    );
  }
  const tied = candidates.filter(
    (c) => partnershipScore(c.teamA, c.teamB, partnerMatrix) === best
  );
  const pick = tied[Math.floor(Math.random() * tied.length)];
  return { ...pick, id: "", court: 0 };
}

/**
 * Segunda mitad: el grupo ya viene ordenado por games (pointsFor) de mayor a menor.
 * 1º+2º vs 3º+4º.
 */
function skillSplitMatchFromOrderedGroup(group: AmericanoPlayer[]): AmericanoMatch {
  return {
    id: "",
    teamA: [group[0], group[1]],
    teamB: [group[2], group[3]],
    court: 0,
  };
}

/**
 * Banquillo: evitar dos descansos seguidos si hay alternativa.
 * Entre candidatos, prioriza descansar a quien más veces ha descansado ya (spec).
 */
export function selectBenchPlayers(
  players: AmericanoPlayer[],
  benchCount: number,
  lastBenchPlayerIds: Set<string>
): AmericanoPlayer[] {
  if (benchCount <= 0 || players.length === 0) return [];
  let pool = players.filter((p) => !lastBenchPlayerIds.has(p.id));
  if (pool.length < benchCount) {
    pool = [...players];
  }
  const sorted = [...pool].sort((a, b) => {
    if (b.stats.roundsOnBench !== a.stats.roundsOnBench) {
      return b.stats.roundsOnBench - a.stats.roundsOnBench;
    }
    if (b.stats.gamesPlayed !== a.stats.gamesPlayed) {
      return b.stats.gamesPlayed - a.stats.gamesPlayed;
    }
    return a.id.localeCompare(b.id);
  });
  return sorted.slice(0, benchCount);
}

export function isFirstHalfRound(roundNumber: number, totalRounds: number): boolean {
  return roundNumber * 2 <= totalRounds;
}

export interface GenerateAmericanoRoundParams {
  /** Lista completa del torneo (mismas referencias que en el estado). */
  allPlayers: AmericanoPlayer[];
  roundNumber: number;
  totalRounds: number;
  courts: number;
  partnerMatrix: PartnerMatrix;
  /** IDs de quienes descansaron la ronda anterior (vacío en la ronda 1). */
  lastBenchPlayerIds: Set<string>;
}

/**
 * Genera una sola ronda. La matriz de compañeros debe reflejar solo partidos ya cerrados
 * (p. ej. vía buildMatricesFromScoredRounds).
 */
export function generateAmericanoRound(
  params: GenerateAmericanoRoundParams
): AmericanoRound {
  const {
    allPlayers,
    roundNumber,
    totalRounds,
    courts,
    partnerMatrix,
    lastBenchPlayerIds,
  } = params;

  if (allPlayers.length < 4) {
    throw new Error("Americano requiere al menos 4 jugadores.");
  }

  const courtSlots = Math.max(1, Math.floor(Number(courts)) || 1);
  const benchCount = allPlayers.length % 4;
  const benchPlayers = selectBenchPlayers(
    allPlayers,
    benchCount,
    lastBenchPlayerIds
  );
  const benchIds = new Set(benchPlayers.map((p) => p.id));
  let activePlayers = allPlayers.filter((p) => !benchIds.has(p.id));

  const firstHalf = isFirstHalfRound(roundNumber, totalRounds);
  const phase: 1 | 2 = firstHalf ? 1 : 2;

  if (firstHalf) {
    activePlayers = shuffle(activePlayers);
  } else {
    activePlayers = [...activePlayers].sort((a, b) => {
      if (b.stats.pointsFor !== a.stats.pointsFor) {
        return b.stats.pointsFor - a.stats.pointsFor;
      }
      return a.name.localeCompare(b.name);
    });
  }

  const matches: AmericanoMatch[] = [];
  for (let i = 0; i < activePlayers.length; i += 4) {
    const group = activePlayers.slice(i, i + 4);
    if (group.length < 4) continue;
    const match = firstHalf
      ? randomMatchAvoidPartnerRepeats(group, partnerMatrix)
      : skillSplitMatchFromOrderedGroup(group);
    matches.push(match);
  }

  const matchCount = matches.length;
  const effectiveCourts = Math.min(courtSlots, Math.max(1, matchCount));
  matches.forEach((match, matchIndex) => {
    const court =
      ((matchIndex + (roundNumber - 1)) % effectiveCourts) + 1;
    match.court = court;
    match.id = `americano-r${roundNumber}-m${matchIndex + 1}-c${court}`;
  });

  return {
    roundNumber,
    phase,
    matches,
    benchPlayers,
  };
}
