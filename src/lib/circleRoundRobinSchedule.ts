import { Match, Pair, updateMatch } from "./database";
import { debugLog } from "./debug/debugLog";

export type ScheduledRoundRobinMatch = {
  pair1: Pair;
  pair2: Pair;
  round: number;
  court: number;
};

/** Asigna canchas rotando explícitamente la pareja ancla (pairs[0] en RR par). */
export function assignCourtsInChunk(
  chunk: Array<{ pair1: Pair; pair2: Pair }>,
  timeRound: number,
  courts: number,
  anchorPairId?: string
): number[] {
  // Nunca más canchas que partidos simultáneos (evita Cancha 4 con 3 partidos).
  const safeCourts = Math.max(1, Math.min(Math.max(1, courts), chunk.length || 1));
  if (chunk.length === 0) {
    return [];
  }

  const anchorIdx =
    anchorPairId != null
      ? chunk.findIndex(
          (m) => m.pair1.id === anchorPairId || m.pair2.id === anchorPairId
        )
      : -1;

  if (anchorIdx < 0) {
    return chunk.map((_, k) => ((timeRound - 1) + k) % safeCourts + 1);
  }

  const anchorCourt = ((timeRound - 1) % safeCourts) + 1;
  const assigned = new Array<number>(chunk.length);
  assigned[anchorIdx] = anchorCourt;

  let nextCourt = anchorCourt;
  for (let i = 0; i < chunk.length; i++) {
    if (i === anchorIdx) continue;
    nextCourt = (nextCourt % safeCourts) + 1;
    assigned[i] = nextCourt;
  }

  return assigned;
}

function packLogicalRoundsIntoTimeSlots(
  logicalRounds: Array<Array<{ pair1: Pair; pair2: Pair }>>,
  courts: number,
  anchorPairId?: string
): ScheduledRoundRobinMatch[] {
  const safeCourts = Math.max(1, courts);
  const out: ScheduledRoundRobinMatch[] = [];
  let timeRound = 1;

  for (const logical of logicalRounds) {
    for (let start = 0; start < logical.length; start += safeCourts) {
      const chunk = logical.slice(start, start + safeCourts);
      const courtsForChunk = assignCourtsInChunk(
        chunk,
        timeRound,
        safeCourts,
        anchorPairId
      );

      for (let k = 0; k < chunk.length; k++) {
        const m = chunk[k];
        out.push({
          pair1: m.pair1,
          pair2: m.pair2,
          round: timeRound,
          court: courtsForChunk[k],
        });
      }
      timeRound += 1;
    }
  }

  return out;
}

/** Calendario round robin (método del círculo) con rotación de canchas por ronda. */
export function generateCircleRoundRobinSchedule(
  pairs: Pair[],
  courts: number
): ScheduledRoundRobinMatch[] {
  if (pairs.length < 2) {
    return [];
  }

  const anchorPairId = pairs[0]?.id;
  const matches: ScheduledRoundRobinMatch[] = [];
  const isOdd = pairs.length % 2 === 1;
  const totalRounds = isOdd ? pairs.length : pairs.length - 1;

  if (isOdd) {
    let circularPairs = [...pairs];
    const logicalRounds: Array<Array<{ pair1: Pair; pair2: Pair }>> = [];

    for (let round = 1; round <= totalRounds; round++) {
      const restingIndex = Math.floor(circularPairs.length / 2);
      const playingPairs = circularPairs.filter((_, index) => index !== restingIndex);
      const possibleMatches = Math.floor(playingPairs.length / 2);
      const roundPairings: Array<{ pair1: Pair; pair2: Pair }> = [];

      for (let i = 0; i < possibleMatches; i++) {
        roundPairings.push({
          pair1: playingPairs[i],
          pair2: playingPairs[playingPairs.length - 1 - i],
        });
      }

      logicalRounds.push(roundPairings);

      if (round < totalRounds) {
        const firstPair = circularPairs.shift();
        if (firstPair) {
          circularPairs.push(firstPair);
        }
      }
    }

    matches.push(
      ...packLogicalRoundsIntoTimeSlots(logicalRounds, courts, anchorPairId)
    );
  } else {
    const fixedPair = pairs[0];
    let rotatingPairs = [...pairs.slice(1)];
    const logicalRounds: Array<Array<{ pair1: Pair; pair2: Pair }>> = [];

    for (let round = 1; round <= totalRounds; round++) {
      const roundPairs = [fixedPair, ...rotatingPairs];
      const possibleMatches = Math.floor(roundPairs.length / 2);
      const roundPairings: Array<{ pair1: Pair; pair2: Pair }> = [];

      for (let i = 0; i < possibleMatches; i++) {
        roundPairings.push({
          pair1: roundPairs[i],
          pair2: roundPairs[roundPairs.length - 1 - i],
        });
      }

      logicalRounds.push(roundPairings);

      if (round < totalRounds) {
        const lastPair = rotatingPairs.pop();
        if (lastPair) {
          rotatingPairs.unshift(lastPair);
        }
      }
    }

    matches.push(
      ...packLogicalRoundsIntoTimeSlots(logicalRounds, courts, fixedPair.id)
    );
  }

  return matches;
}

export function matchPairingKey(
  round: number,
  pair1Id: string,
  pair2Id: string
): string {
  const [a, b] = pair1Id < pair2Id ? [pair1Id, pair2Id] : [pair2Id, pair1Id];
  return `${round}:${a}:${b}`;
}

/**
 * Elige qué parejas de un equipo juegan esta ronda.
 * Si hay menos cupos que parejas, rota quién descansa para que no
 * descanse siempre la misma pareja.
 */
export function selectPlayingPairsForRound(
  teamPairs: Pair[],
  playCount: number,
  roundZeroBased: number
): Pair[] {
  const n = teamPairs.length;
  if (playCount <= 0 || n === 0) return [];
  if (playCount >= n) return teamPairs.slice();

  const restCount = n - playCount;
  const resting = new Set<number>();
  for (let j = 0; j < restCount; j += 1) {
    resting.add((roundZeroBased * restCount + j) % n);
  }
  return teamPairs.filter((_, idx) => !resting.has(idx));
}

type TeamEdge = { i: number; j: number };

/**
 * Empaqueta aristas pendientes en una ronda de hasta `capacity` partidos,
 * sin repetir pareja. Prioriza aristas que involucran a quienes descansaron
 * la ronda anterior (evita el mismo descanso seguido).
 */
function packRoundEdges(
  pending: TeamEdge[],
  capacity: number,
  preferPlay0: Set<number>,
  preferPlay1: Set<number>
): { round: TeamEdge[]; remaining: TeamEdge[] } {
  const scored = pending
    .map((e, idx) => ({
      e,
      idx,
      score:
        (preferPlay0.has(e.i) ? 2 : 0) +
        (preferPlay1.has(e.j) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const used0 = new Set<number>();
  const used1 = new Set<number>();
  const round: TeamEdge[] = [];
  const remaining: TeamEdge[] = [];

  for (const { e } of scored) {
    if (
      round.length < capacity &&
      !used0.has(e.i) &&
      !used1.has(e.j)
    ) {
      round.push(e);
      used0.add(e.i);
      used1.add(e.j);
    } else {
      remaining.push(e);
    }
  }

  return { round, remaining };
}

/**
 * Calendario cruzado equipo0 × equipo1: todas las parejas de un equipo
 * contra todas las del otro (sin partidos intra-equipo). Cuando hay menos
 * canchas que parejas, rota los descansos entre rondas.
 */
export function generateTeamsCrossSchedule(
  team0Pairs: Pair[],
  team1Pairs: Pair[],
  courts: number
): ScheduledRoundRobinMatch[] {
  const n0 = team0Pairs.length;
  const n1 = team1Pairs.length;
  if (n0 === 0 || n1 === 0) return [];

  const matchesPerRound = Math.min(n0, n1, Math.max(1, courts));
  const effectiveCourts = Math.min(
    Math.max(1, courts),
    Math.max(1, matchesPerRound)
  );

  // Todas las aristas únicas en orden circular (cobertura completa).
  const pending: TeamEdge[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < n1; offset += 1) {
    for (let i = 0; i < n0; i += 1) {
      const j = (i + offset) % n1;
      const key = `${i}:${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push({ i, j });
    }
  }

  const scheduled: ScheduledRoundRobinMatch[] = [];
  let queue = pending;
  let roundNum = 1;
  let preferPlay0 = new Set<number>();
  let preferPlay1 = new Set<number>();

  while (queue.length > 0) {
    const { round, remaining } = packRoundEdges(
      queue,
      matchesPerRound,
      preferPlay0,
      preferPlay1
    );
    if (round.length === 0) break;

    const playing0 = new Set(round.map((e) => e.i));
    const playing1 = new Set(round.map((e) => e.j));
    preferPlay0 = new Set(
      Array.from({ length: n0 }, (_, i) => i).filter((i) => !playing0.has(i))
    );
    preferPlay1 = new Set(
      Array.from({ length: n1 }, (_, j) => j).filter((j) => !playing1.has(j))
    );

    const roundOffset = (roundNum - 1) % Math.max(1, round.length);
    for (let slotIndex = 0; slotIndex < round.length; slotIndex += 1) {
      const edge = round[slotIndex];
      const rotatedSlot = (slotIndex + roundOffset) % round.length;
      const court =
        ((roundNum - 1) + rotatedSlot) % effectiveCourts + 1;
      scheduled.push({
        pair1: team0Pairs[edge.i],
        pair2: team1Pairs[edge.j],
        round: roundNum,
        court,
      });
    }

    queue = remaining;
    roundNum += 1;
  }

  return scheduled;
}

export function buildIdealCourtMap(
  pairs: Pair[],
  courts: number
): Map<string, number> {
  const ideal = generateCircleRoundRobinSchedule(pairs, courts);
  const map = new Map<string, number>();
  for (const m of ideal) {
    map.set(matchPairingKey(m.round, m.pair1.id, m.pair2.id), m.court);
  }
  return map;
}

export function findCourtRotationRepairs(
  pairs: Pair[],
  courts: number,
  matches: Match[]
): Array<{ id: string; court: number }> {
  const configuredCourts = Math.max(1, courts);
  if (configuredCourts < 2 || pairs.length < 2 || matches.length === 0) {
    return [];
  }

  const regular = matches.filter((m) => m.match_type !== "championship");
  if (regular.length === 0) {
    return [];
  }

  const byRound = new Map<number, Match[]>();
  for (const m of regular) {
    const round = Number(m.round ?? 1);
    const list = byRound.get(round);
    if (list) list.push(m);
    else byRound.set(round, [m]);
  }

  const repairs: Array<{ id: string; court: number }> = [];

  for (const roundMatches of Array.from(byRound.values())) {
    // Tope por ronda: min(canchas config, partidos simultáneos).
    const effectiveCourts = Math.max(
      1,
      Math.min(configuredCourts, roundMatches.length)
    );
    const used = new Set<number>();
    for (const m of roundMatches) {
      if (m.court != null && m.court >= 1 && m.court <= effectiveCourts) {
        used.add(m.court);
      }
    }

    for (const m of roundMatches) {
      // NULL = Por asignar a propósito. No reasignar.
      if (m.court == null) continue;
      if (m.court >= 1 && m.court <= effectiveCourts) continue;

      let next = 1;
      while (next <= effectiveCourts && used.has(next)) next += 1;
      if (next > effectiveCourts) {
        next = ((Math.max(1, m.court) - 1) % effectiveCourts) + 1;
      }
      used.add(next);
      repairs.push({ id: m.id, court: next });
    }
  }

  return repairs;
}

/**
 * Corrige solo canchas fuera de rango (p.ej. Cancha 4 con 3 canchas configuradas).
 * No pisa ediciones manuales ni la rotación ya válida.
 */
export async function repairMatchCourtRotation(
  pairs: Pair[],
  courts: number,
  matches: Match[],
  format?: string | null
): Promise<Match[]> {
  if (format === "teams") {
    return matches;
  }

  const safeCourts = Math.max(1, courts || 1);
  if (safeCourts < 2 || matches.length === 0) {
    return matches;
  }

  const repairs = findCourtRotationRepairs(pairs, safeCourts, matches);
  if (repairs.length === 0) {
    return matches;
  }

  debugLog(
    `[circle-rr] reparando rotación de canchas en ${repairs.length} partido(s)`
  );

  const repairById = new Map(repairs.map((r) => [r.id, r.court]));
  const results = await Promise.allSettled(
    repairs.map((r) => updateMatch(r.id, { court: r.court }))
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `❌ No se pudieron actualizar ${failed.length} cancha(s):`,
      failed
    );
  }

  return matches.map((m) =>
    repairById.has(m.id) ? { ...m, court: repairById.get(m.id)! } : m
  );
}
