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
  const safeCourts = Math.max(1, courts);
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
  const safeCourts = Math.max(1, courts);
  if (safeCourts < 2 || pairs.length < 2 || matches.length === 0) {
    return [];
  }

  const regular = matches.filter((m) => m.match_type !== "championship");
  if (regular.length === 0) {
    return [];
  }

  const idealCourts = buildIdealCourtMap(pairs, safeCourts);
  const repairs: Array<{ id: string; court: number }> = [];
  let missingIdeal = 0;

  for (const m of regular) {
    const round = Number(m.round ?? 1);
    const key = matchPairingKey(round, m.pair1_id, m.pair2_id);
    const idealCourt = idealCourts.get(key);
    if (idealCourt == null) {
      missingIdeal += 1;
      continue;
    }
    if (m.court !== idealCourt) {
      repairs.push({ id: m.id, court: idealCourt });
    }
  }

  if (missingIdeal > 0) {
    console.warn(
      `⚠️ Rotación de canchas: ${missingIdeal} partido(s) no coinciden con el calendario ideal; se reparan ${repairs.length} cancha(s) coincidentes.`
    );
  }

  return repairs;
}

/** Corrige canchas de partidos RR generados con el algoritmo viejo (sin rotación). */
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
