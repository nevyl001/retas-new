import type { AmericanoPlayer, AmericanoRound } from "../../db/types";
import {
  generateAmericanoRound,
  initializeMatrix,
  updateMatrices,
} from "../../americanoGenerator";
import { FLEX_MAX_PLAYERS, FLEX_MAX_ROUNDS, FLEX_MIN_PLAYERS } from "./constants";

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
  needsConfirmation: boolean;
  limitations: string[];
};

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

const SEARCH_TRIALS_EXACT = 4;

export function generateFlexSchedule(input: {
  players: readonly FlexSchedulePlayer[];
  courts: number;
  rounds: number;
  seed: number;
  trials?: number;
}): FlexSchedule | FlexScheduleFailure {
  const prepared = prepare(input);
  if (!prepared.ok) return prepared;
  const trials = input.trials ?? (prepared.players.length > 12 ? 1 : SEARCH_TRIALS_EXACT);
  let best: FlexSchedule | null = null;
  for (let offset = 0; offset < trials; offset += 1) {
    const seed = normalizeSeed(input.seed + offset);
    const built = buildOnce(prepared.players, prepared.courts, prepared.rounds, seed);
    if (!built.ok) continue;
    if (!best || qualityScore(built.quality) < qualityScore(best.quality)) {
      best = built;
    }
  }
  if (!best) {
    return {
      ok: false,
      error: "No se encontró una programación válida con estas canchas y rondas.",
    };
  }
  return best;
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
  let fallback: FlexSchedule | null = null;
  for (let offset = 0; offset < attempts; offset += 1) {
    const next = generateFlexSchedule({
      players: input.players,
      courts: input.courts,
      rounds: input.rounds,
      seed: start + offset * 17,
      trials: 1,
    });
    if (!next.ok) continue;
    if (!fallback || qualityScore(next.quality) < qualityScore(fallback.quality)) {
      fallback = next;
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
  if (input.players.length < FLEX_MIN_PLAYERS || input.players.length > FLEX_MAX_PLAYERS) {
    return {
      ok: false,
      error: `La jornada necesita entre ${FLEX_MIN_PLAYERS} y ${FLEX_MAX_PLAYERS} jugadores.`,
    };
  }
  const courts = Math.floor(input.courts);
  const rounds = Math.floor(input.rounds);
  if (courts < 1) return { ok: false, error: "Indica al menos una cancha." };
  if (rounds < 1 || rounds > FLEX_MAX_ROUNDS) {
    return { ok: false, error: `Las rondas deben estar entre 1 y ${FLEX_MAX_ROUNDS}.` };
  }
  const active = Math.min(Math.floor(input.players.length / 4), courts) * 4;
  if (active < 4) {
    return { ok: false, error: "Con esas canchas no cabe un partido." };
  }
  return {
    ok: true,
    players: input.players.map((p) => ({ id: p.id, name: p.name })),
    courts,
    rounds,
  };
}

function buildOnce(
  players: readonly FlexSchedulePlayer[],
  courts: number,
  rounds: number,
  seed: number
): FlexSchedule | FlexScheduleFailure {
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

  const quality = measure(live, partnerMatrix, rivalMatrix, planned, realOf);
  return { ok: true, seed, signature: signatureOf(planned), rounds: planned, quality };
}

function hardErrors(
  round: AmericanoRound,
  players: AmericanoPlayer[],
  courts: number,
  names: Map<string, string>
): string[] {
  const errors: string[] = [];
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

function measure(
  players: AmericanoPlayer[],
  partnerMatrix: Record<string, Record<string, number>>,
  rivalMatrix: Record<string, Record<string, number>>,
  planned: FlexSchedule["rounds"],
  realOf: Map<string, string>
): FlexScheduleQuality {
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
  let partnerRepeats = 0;
  let rivalRepeats = 0;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i]!.id;
      const b = players[j]!.id;
      partnerRepeats += Math.max(0, (partnerMatrix[a]?.[b] ?? 0) - 1);
      rivalRepeats += Math.max(0, (rivalMatrix[a]?.[b] ?? 0) - 1);
    }
  }
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
    limitations.push(
      "Con estas rondas no existe una distribución sin repetir algún compañero. Se eligió la de menos repeticiones."
    );
  }
  if (playSpread > 1) {
    limitations.push("La diferencia de partidos entre jugadores es mayor a uno.");
  }
  if (consecutiveBenches > 0) {
    limitations.push("Algún descanso quedó seguido porque no hubo otra banca viable.");
  }
  return {
    rounds: planned.length,
    matches: planned.reduce((sum, round) => sum + round.matches.length, 0),
    matchesByPlayer,
    benchesByPlayer,
    playSpread,
    benchSpread,
    partnerRepeats,
    rivalRepeats,
    consecutiveBenches,
    needsConfirmation: limitations.length > 0,
    limitations,
  };
}

function qualityScore(quality: FlexScheduleQuality): number {
  return (
    quality.partnerRepeats * 10000 +
    Math.max(0, quality.playSpread - 1) * 8000 +
    quality.benchSpread * 2000 +
    quality.consecutiveBenches * 1500 +
    quality.rivalRepeats * 100
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
