import type { AmericanoPlayer, AmericanoRound } from "../../db/types";
import {
  generateAmericanoRound,
  initializeMatrix,
  updateMatrices,
} from "../../americanoGenerator";
import { FLEX_ALGORITHM_VERSION, FLEX_MAX_ROUNDS } from "./constants";

export type FlexSchedulePlayer = { id: string; name: string };

export type FlexPlannedMatch = {
  round: number;
  court: number;
  pairA: [string, string];
  pairB: [string, string];
};

export type FlexScheduleQuality = {
  rounds: number;
  matches: number;
  matchesByPlayer: Record<string, number>;
  benchesByPlayer: Record<string, number>;
  playSpread: number;
  benchSpread: number;
  partnerRepeats: number;
  rivalRepeats: number;
  consecutiveBenches: number;
  maxPartnerRepeat: number;
  courtsUsed: number;
  rests: number;
  algorithmVersion: string;
  needsConfirmation: boolean;
  limitations: string[];
};

export type FlexLayout =
  | { ok: true; courtsUsed: number }
  | { ok: false; pending: boolean; error: string };

/** 12 usan 3 canchas y 16 usan 4. 13, 14 y 15 se quedan pendientes: nadie se borra. */
export function officialFlexLayout(playerCount: number, courtsAvailable: number): FlexLayout {
  const players = Math.floor(playerCount);
  const courts = Math.floor(courtsAvailable);
  if (players === 13 || players === 14 || players === 15) {
    return {
      ok: false,
      pending: true,
      error:
        "Con 13, 14 o 15 jugadores no caben partidos de cuatro sin dejar a alguien fuera. Ajusta la lista a 12 o completa 16. No se retira a nadie.",
    };
  }
  if (players !== 12 && players !== 16) {
    return {
      ok: false,
      pending: false,
      error: "La jornada oficial se juega con 12 o 16 jugadores.",
    };
  }
  const courtsUsed = players / 4;
  if (courts < courtsUsed) {
    return {
      ok: false,
      pending: false,
      error: `Hacen falta ${courtsUsed} canchas para que los ${players} jueguen a la vez. Hay ${Math.max(0, courts)}.`,
    };
  }
  return { ok: true, courtsUsed };
}

export type FlexSchedule = {
  ok: true;
  seed: number;
  signature: string;
  rounds: Array<{
    round: number;
    matches: FlexPlannedMatch[];
    benchIds: string[];
  }>;
  quality: FlexScheduleQuality;
};

export type FlexScheduleFailure = { ok: false; error: string };

export function generateFlexSchedule(input: {
  players: readonly FlexSchedulePlayer[];
  courts: number;
  rounds: number;
  seed: number;
  trials?: number;
}): FlexSchedule | FlexScheduleFailure {
  const prepared = prepare(input);
  if (!prepared.ok) return prepared;
  const trials = input.trials ?? (prepared.players.length > 12 ? 3 : 6);
  let best: (FlexSchedule & { selectionScore: number }) | null = null;
  for (let offset = 0; offset < trials; offset += 1) {
    const seed = normalizeSeed(input.seed + offset);
    const built = buildOnce(prepared.players, prepared.courts, prepared.rounds, seed);
    if (!built.ok) continue;
    if (!best || built.selectionScore < best.selectionScore) {
      best = built;
    }
  }
  if (!best) {
    return {
      ok: false,
      error: "No se encontró una programación válida con estas canchas y rondas.",
    };
  }
  const { selectionScore: _selectionScore, ...schedule } = best;
  return schedule;
}

export function regenerateFlexSchedule(input: {
  players: readonly FlexSchedulePlayer[];
  courts: number;
  rounds: number;
  seed: number;
  previousSignature: string;
  trials?: number;
}): (FlexSchedule & { changed: boolean }) | FlexScheduleFailure {
  const start = normalizeSeed(input.seed + 1);
  const attempts = input.trials ?? 8;
  let fallback: (FlexSchedule & { selectionScore: number }) | null = null;
  for (let offset = 0; offset < attempts; offset += 1) {
    const next = generateFlexSchedule({
      players: input.players,
      courts: input.courts,
      rounds: input.rounds,
      seed: start + offset * 17,
      trials: 1,
    });
    if (!next.ok) continue;
    const scored = { ...next, selectionScore: qualityScore(next.quality) };
    if (!fallback || scored.selectionScore < fallback.selectionScore) {
      fallback = scored;
    }
    if (next.signature !== input.previousSignature) {
      return { ...next, changed: true };
    }
  }
  if (!fallback) {
    return { ok: false, error: "No se pudo regenerar una programación válida." };
  }
  return { ...fallback, changed: false };
}

export function scheduleCoversPlayers(
  schedule: FlexSchedule,
  playerIds: readonly string[]
): boolean {
  const expected = [...playerIds].sort().join("|");
  const seen = new Set<string>();
  for (const round of schedule.rounds) {
    for (const id of round.benchIds) seen.add(id);
    for (const match of round.matches) {
      for (const id of [...match.pairA, ...match.pairB]) seen.add(id);
    }
  }
  return Array.from(seen).sort().join("|") === expected;
}

export function scheduleHasCapturedResults(
  scores: readonly { scoreA: number | null; scoreB: number | null }[]
): boolean {
  return scores.some((s) => s.scoreA != null || s.scoreB != null);
}

function prepare(input: {
  players: readonly FlexSchedulePlayer[];
  courts: number;
  rounds: number;
}): { ok: true; players: FlexSchedulePlayer[]; courts: number; rounds: number } | FlexScheduleFailure {
  const ids = input.players.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Hay un jugador duplicado en la jornada." };
  }
  const rounds = Math.floor(input.rounds);
  if (rounds < 1 || rounds > FLEX_MAX_ROUNDS) {
    return { ok: false, error: `Las rondas deben estar entre 1 y ${FLEX_MAX_ROUNDS}.` };
  }
  const layout = officialFlexLayout(input.players.length, input.courts);
  if (!layout.ok) return { ok: false, error: layout.error };
  return {
    ok: true,
    players: input.players.map((p) => ({ id: p.id, name: p.name })),
    courts: layout.courtsUsed,
    rounds,
  };
}

function buildOnce(
  players: readonly FlexSchedulePlayer[],
  courts: number,
  rounds: number,
  seed: number
): (FlexSchedule & { selectionScore: number }) | FlexScheduleFailure {
  const ordered = seededShuffle(players, seed);
  // El Americano, ante un empate de costo, ordena por id. El alias sigue la
  // semilla para que el Riviera ID o el orden de inscripción no tengan ventaja.
  const realOf = new Map<string, string>();
  const live: AmericanoPlayer[] = ordered.map((p, index) => {
    const alias = `f${String(index).padStart(2, "0")}`;
    realOf.set(alias, p.id);
    return {
      id: alias,
      name: p.name,
      stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 },
    };
  });
  const partnerMatrix = initializeMatrix(live);
  const rivalMatrix = initializeMatrix(live);
  const planned: FlexSchedule["rounds"] = [];
  const prior: AmericanoRound[] = [];
  let lastBench = new Set<string>();
  const names = new Map(live.map((p) => [p.id, p.name]));

  try {
    withRandom(mulberry32(seed), () => {
      for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
        const round = generateAmericanoRound({
          allPlayers: live,
          roundNumber,
          totalRounds: rounds,
          courts,
          partnerMatrix,
          rivalMatrix,
          lastBenchPlayerIds: lastBench,
          priorRounds: prior,
        });
        const errors = hardErrors(round, live, courts, names);
        if (errors.length > 0) {
          throw new Error(errors[0]);
        }
        for (const match of round.matches) updateMatrices(match, partnerMatrix, rivalMatrix);
        for (const player of round.benchPlayers) player.stats.roundsOnBench += 1;
        for (const match of round.matches) {
          for (const player of [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]]) {
            player.stats.gamesPlayed += 1;
          }
        }
        const real = (alias: string) => realOf.get(alias) ?? alias;
        planned.push({
          round: roundNumber,
          benchIds: round.benchPlayers.map((p) => real(p.id)),
          matches: round.matches.map((match) => ({
            round: roundNumber,
            court: match.court,
            pairA: [real(match.teamA[0].id), real(match.teamA[1].id)],
            pairB: [real(match.teamB[0].id), real(match.teamB[1].id)],
          })),
        });
        prior.push(round);
        lastBench = new Set(round.benchPlayers.map((p) => p.id));
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "La generación no fue válida.",
    };
  }

  if (planned.length !== rounds) {
    return { ok: false, error: "No se generaron todas las rondas pedidas." };
  }

  const measured = measure(live, partnerMatrix, rivalMatrix, planned, realOf);
  return {
    ok: true,
    seed,
    signature: signatureOf(planned),
    rounds: planned,
    quality: measured.quality,
    selectionScore: measured.selectionScore,
  };
}

function hardErrors(
  round: AmericanoRound,
  players: AmericanoPlayer[],
  courts: number,
  names: Map<string, string>
): string[] {
  const errors: string[] = [];
  if (round.benchPlayers.length > 0) {
    errors.push("Flex League no admite descansos.");
  }
  const roster = new Set(players.map((p) => p.id));
  const seen = new Set<string>();
  if (round.matches.length > courts) errors.push("Hay más partidos que canchas.");
  for (const player of round.benchPlayers) {
    if (!roster.has(player.id)) errors.push("Descansa alguien que no está en la jornada.");
    if (seen.has(player.id)) errors.push(`Descanso duplicado: ${names.get(player.id) ?? player.id}`);
    seen.add(player.id);
  }
  for (const match of round.matches) {
    const ids = [match.teamA[0].id, match.teamA[1].id, match.teamB[0].id, match.teamB[1].id];
    if (new Set(ids).size !== 4) errors.push("Un partido no tiene cuatro jugadores distintos.");
    for (const id of ids) {
      if (!roster.has(id)) errors.push("Un partido incluye a alguien fuera de la jornada.");
      if (seen.has(id)) errors.push(`Jugador en dos sitios de la misma ronda: ${names.get(id) ?? id}`);
      seen.add(id);
    }
  }
  if (seen.size !== players.length) errors.push("Una ronda no cubre a todos los participantes.");
  return errors;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function bumpPair(counts: Map<string, number>, a: string, b: string): void {
  const key = pairKey(a, b);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function measure(
  players: AmericanoPlayer[],
  _partnerMatrix: Record<string, Record<string, number>>,
  rivalMatrix: Record<string, Record<string, number>>,
  planned: FlexSchedule["rounds"],
  realOf: Map<string, string>
): { quality: FlexScheduleQuality; selectionScore: number } {
  const matchesByPlayer: Record<string, number> = {};
  const benchesByPlayer: Record<string, number> = {};
  for (const player of players) {
    const id = realOf.get(player.id) ?? player.id;
    matchesByPlayer[id] = player.stats.gamesPlayed;
    benchesByPlayer[id] = player.stats.roundsOnBench;
  }
  const plays = Object.values(matchesByPlayer);
  const benches = Object.values(benchesByPlayer);
  const playSpread = Math.max(...plays) - Math.min(...plays);
  const benchSpread = Math.max(...benches) - Math.min(...benches);
  let matrixRivalRepeats = 0;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i]!.id;
      const b = players[j]!.id;
      const faced = rivalMatrix[a]?.[b] ?? 0;
      matrixRivalRepeats += Math.max(0, faced - 1);
    }
  }
  const partnerCounts = new Map<string, number>();
  const rivalCounts = new Map<string, number>();
  for (const round of planned) {
    for (const match of round.matches) {
      bumpPair(partnerCounts, match.pairA[0], match.pairA[1]);
      bumpPair(partnerCounts, match.pairB[0], match.pairB[1]);
      for (const a of match.pairA) {
        for (const b of match.pairB) bumpPair(rivalCounts, a, b);
      }
    }
  }
  let partnerRepeats = 0;
  let maxPartnerRepeat = 0;
  partnerCounts.forEach((count) => {
    partnerRepeats += Math.max(0, count - 1);
    if (count > maxPartnerRepeat) maxPartnerRepeat = count;
  });
  let rivalRepeats = 0;
  rivalCounts.forEach((count) => {
    rivalRepeats += Math.max(0, count - 1);
  });
  let consecutiveBenches = 0;
  const benchByRound = planned.map((round) => new Set(round.benchIds));
  for (const player of players) {
    const id = realOf.get(player.id) ?? player.id;
    for (let r = 1; r < benchByRound.length; r += 1) {
      if (benchByRound[r - 1]!.has(id) && benchByRound[r]!.has(id)) {
        consecutiveBenches += 1;
      }
    }
  }
  const limitations: string[] = [];
  if (partnerRepeats > 0) {
    limitations.push("Algunas parejas se repiten. Con estas rondas no había otra combinación sin hacerlo.");
  }
  if (benchSpread > 0 || consecutiveBenches > 0) {
    limitations.push("La programación dejó descansos y no es válida para Flex League.");
  }
  const quality: FlexScheduleQuality = {
    rounds: planned.length,
    matches: planned.reduce((sum, round) => sum + round.matches.length, 0),
    matchesByPlayer,
    benchesByPlayer,
    playSpread,
    benchSpread,
    partnerRepeats,
    rivalRepeats,
    consecutiveBenches,
    maxPartnerRepeat,
    courtsUsed: planned[0]?.matches.length ?? 0,
    rests: planned.reduce((sum, round) => sum + round.benchIds.length, 0),
    algorithmVersion: FLEX_ALGORITHM_VERSION,
    needsConfirmation: partnerRepeats > 0,
    limitations,
  };
  return {
    quality,
    selectionScore: qualityScore({ ...quality, rivalRepeats: matrixRivalRepeats }),
  };
}

function qualityScore(quality: FlexScheduleQuality): number {
  return (
    quality.partnerRepeats * 10000 +
    Math.max(0, quality.playSpread - 1) * 8000 +
    quality.rests * 50000 +
    quality.maxPartnerRepeat * 500 +
    quality.rivalRepeats * 10
  );
}

function signatureOf(rounds: FlexSchedule["rounds"]): string {
  return rounds
    .map((round) => {
      const matches = round.matches
        .map((match) => {
          const a = [...match.pairA].sort().join("+");
          const b = [...match.pairB].sort().join("+");
          return [a, b].sort().join("vs");
        })
        .sort()
        .join(",");
      return `${round.round}:${matches}`;
    })
    .join("||");
}

function normalizeSeed(seed: number): number {
  const n = Math.floor(Math.abs(seed));
  return n > 0 ? n : 1;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withRandom<T>(rng: () => number, fn: () => T): T {
  const previous = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  const rng = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}
