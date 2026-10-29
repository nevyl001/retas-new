import { Match, Pair, updateMatch } from "./database";
import { debugLog } from "./debug/debugLog";
import {
  expectedRoundRobinTotals,
  validateSchedule,
} from "./roundRobinValidate";

export type ScheduledRoundRobinMatch = {
  pair1: Pair;
  pair2: Pair;
  round: number;
  court: number;
};

export type GenerateRoundRobinOptions = {
  /** Misma semilla ⇒ mismo calendario. */
  seed?: number;
  /** Tope de nodos de backtracking por intento. */
  maxNodes?: number;
  /** Tope de tiempo (ms) por intento. */
  maxMs?: number;
  /** Reintentos con semillas derivadas si el primero falla. */
  maxAttempts?: number;
};

export {
  validateSchedule,
  expectedRoundRobinTotals,
} from "./roundRobinValidate";

/** Calendario de referencia verificado para 8 parejas / 3 canchas (índices 0–7). */
export const REFERENCE_SCHEDULE_8x3: ReadonlyArray<
  ReadonlyArray<readonly [number, number]>
> = [
  [
    [1, 2],
    [3, 4],
    [0, 7],
  ],
  [
    [2, 6],
    [4, 7],
    [3, 5],
  ],
  [
    [1, 6],
    [5, 7],
    [0, 3],
  ],
  [
    [3, 7],
    [0, 4],
    [2, 5],
  ],
  [
    [0, 6],
    [2, 4],
    [1, 5],
  ],
  [
    [1, 3],
    [4, 6],
    [2, 7],
  ],
  [
    [1, 7],
    [5, 6],
    [0, 2],
  ],
  [
    [0, 1],
    [4, 5],
    [3, 6],
  ],
  [
    [6, 7],
    [1, 4],
    [2, 3],
  ],
  [[0, 5]],
];

type Edge = { a: number; b: number };

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function seededPermutation(n: number, seed: number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  shuffleInPlace(perm, createRng(seed));
  return perm;
}

function allEdges(n: number): Edge[] {
  const edges: Edge[] = [];
  for (let a = 0; a < n; a += 1) {
    for (let b = a + 1; b < n; b += 1) {
      edges.push({ a, b });
    }
  }
  return edges;
}

function edgeKey(e: Edge): string {
  return e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
}

function degreeMap(pending: Edge[], n: number): number[] {
  const deg = Array.from({ length: n }, () => 0);
  for (const e of pending) {
    deg[e.a] += 1;
    deg[e.b] += 1;
  }
  return deg;
}

/** Enumera matchings de tamaño `target` priorizando aristas de alta demanda. */
function enumerateMatchings(
  pending: Edge[],
  n: number,
  target: number,
  rng: () => number,
  hardCap: number
): Edge[][] {
  if (target <= 0) return [[]];
  const deg = degreeMap(pending, n);
  const ordered = pending
    .map((e, idx) => ({
      e,
      idx,
      score: deg[e.a] + deg[e.b],
      jitter: rng(),
    }))
    .sort(
      (x, y) =>
        y.score - x.score || x.jitter - y.jitter || x.idx - y.idx
    )
    .map((row) => row.e);

  const out: Edge[][] = [];
  const used = new Set<number>();
  const chosen: Edge[] = [];

  const dfs = (start: number) => {
    if (out.length >= hardCap) return;
    if (chosen.length === target) {
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i < ordered.length; i += 1) {
      if (out.length >= hardCap) return;
      const e = ordered[i];
      if (used.has(e.a) || used.has(e.b)) continue;
      used.add(e.a);
      used.add(e.b);
      chosen.push(e);
      dfs(i + 1);
      chosen.pop();
      used.delete(e.a);
      used.delete(e.b);
    }
  };

  dfs(0);
  return out;
}

function restingIndices(n: number, roundEdges: Edge[]): number[] {
  const playing = new Set<number>();
  for (const e of roundEdges) {
    playing.add(e.a);
    playing.add(e.b);
  }
  const rest: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!playing.has(i)) rest.push(i);
  }
  return rest;
}

function searchCourtLimitedSchedule(
  n: number,
  courts: number,
  seed: number,
  maxNodes: number,
  maxMs: number
): Edge[][] | null {
  const { matches: expectedMatches, rounds: expectedRounds } =
    expectedRoundRobinTotals(n, courts);
  if (expectedMatches === 0) return [];

  const strictEightThree = n === 8 && courts === 3;
  const rng = createRng(seed);
  const pending = allEdges(n);
  shuffleInPlace(pending, rng);

  const rounds: Edge[][] = [];
  const restCount = Array.from({ length: n }, () => 0);
  let nodes = 0;
  const started = Date.now();

  const dfs = (): boolean => {
    nodes += 1;
    if (nodes > maxNodes || Date.now() - started > maxMs) return false;

    if (pending.length === 0) {
      return rounds.length === expectedRounds;
    }
    if (rounds.length >= expectedRounds) return false;

    const roundIndex = rounds.length; // 0-based
    const isLast = roundIndex === expectedRounds - 1;
    const remainingRounds = expectedRounds - roundIndex;
    const target = isLast
      ? pending.length
      : Math.min(courts, pending.length);

    if (target > courts) return false;
    if (!isLast && pending.length - target > courts * (remainingRounds - 1)) {
      // Demasiados partidos para las rondas restantes aunque llenen canchas.
      return false;
    }
    if (!isLast && target !== courts && pending.length >= courts) {
      // Mientras quepan C partidos, la ronda intermedia debe llenar canchas.
      return false;
    }

    if (strictEightThree) {
      if (roundIndex < 9 && target !== 3) return false;
      if (roundIndex === 9 && target !== 1) return false;
    }

    const candidates = enumerateMatchings(
      pending,
      n,
      target,
      rng,
      strictEightThree && roundIndex === 9 ? 32 : 400
    );

    // Heurística: priorizar matchings que cubren a quienes tienen más pendientes.
    const deg = degreeMap(pending, n);
    candidates.sort((A, B) => {
      const score = (edges: Edge[]) =>
        edges.reduce((s, e) => s + deg[e.a] + deg[e.b], 0);
      return score(B) - score(A) || rng() - 0.5;
    });

    const prevRest =
      roundIndex > 0 ? new Set(restingIndices(n, rounds[roundIndex - 1])) : null;

    for (const cand of candidates) {
      const rest = restingIndices(n, cand);

      if (strictEightThree) {
        let restOk = true;
        for (const i of rest) {
          if (restCount[i] >= 3) {
            restOk = false;
            break;
          }
          if (prevRest && prevRest.has(i)) {
            restOk = false;
            break;
          }
        }
        if (!restOk) continue;

        // Condición R10 dentro de la búsqueda: al cerrar R9 debe quedar
        // exactamente 1 arista entre las 2 que descansan en R9.
        if (roundIndex === 8) {
          const restSet = new Set(rest);
          const leftover = pending.filter((e) => {
            const inCand =
              cand.some(
                (x) =>
                  (x.a === e.a && x.b === e.b) || (x.a === e.b && x.b === e.a)
              );
            return !inCand;
          });
          if (leftover.length !== 1) continue;
          const last = leftover[0];
          if (!restSet.has(last.a) || !restSet.has(last.b)) continue;
        }
      }

      // Aplicar candidato
      const removedKeys = new Set(cand.map(edgeKey));
      const kept: Edge[] = [];
      const removed: Edge[] = [];
      for (const e of pending) {
        if (removedKeys.has(edgeKey(e))) removed.push(e);
        else kept.push(e);
      }
      pending.length = 0;
      pending.push(...kept);
      for (const i of rest) restCount[i] += 1;
      rounds.push(cand);

      if (dfs()) return true;

      rounds.pop();
      for (const i of rest) restCount[i] -= 1;
      pending.push(...removed);
    }

    return false;
  };

  return dfs() ? rounds.map((r) => r.map((e) => ({ a: e.a, b: e.b }))) : null;
}

function materializeRounds(
  pairsOrdered: Pair[],
  indexRounds: Edge[][],
  courts: number
): ScheduledRoundRobinMatch[] {
  const anchorPairId = pairsOrdered[0]?.id;
  const out: ScheduledRoundRobinMatch[] = [];
  for (let r = 0; r < indexRounds.length; r += 1) {
    const chunk = indexRounds[r].map((e) => ({
      pair1: pairsOrdered[e.a],
      pair2: pairsOrdered[e.b],
    }));
    const timeRound = r + 1;
    const courtsForChunk = assignCourtsInChunk(
      chunk,
      timeRound,
      courts,
      anchorPairId
    );
    for (let k = 0; k < chunk.length; k += 1) {
      out.push({
        pair1: chunk[k].pair1,
        pair2: chunk[k].pair2,
        round: timeRound,
        court: courtsForChunk[k],
      });
    }
  }
  return out;
}

/** Aplica el calendario de referencia 8×3 reasignando índices 0–7 vía semilla. */
export function buildReferenceSchedule8x3(
  pairs: Pair[],
  seed: number
): ScheduledRoundRobinMatch[] {
  if (pairs.length !== 8) {
    throw new Error("El calendario de referencia 8×3 requiere exactamente 8 parejas.");
  }
  const ordered = [...pairs].sort((a, b) => a.id.localeCompare(b.id));
  const perm = seededPermutation(8, seed);
  const indexed = perm.map((i) => ordered[i]);
  const indexRounds: Edge[][] = REFERENCE_SCHEDULE_8x3.map((round) =>
    round.map(([a, b]) => ({ a, b }))
  );
  return materializeRounds(indexed, indexRounds, 3);
}

/**
 * Genera preview sin escribir: calendario + errores de validación.
 * Nunca persiste.
 */
export function previewCircleRoundRobinSchedule(
  pairs: Pair[],
  courts: number,
  options?: GenerateRoundRobinOptions
): {
  schedule: ScheduledRoundRobinMatch[];
  errors: string[];
  usedFallback: boolean;
  seed: number;
} {
  const result = generateCircleRoundRobinScheduleDetailed(pairs, courts, options);
  const errors = validateSchedule(
    result.schedule.map((m) => ({
      pair1Id: m.pair1.id,
      pair2Id: m.pair2.id,
      round: m.round,
      court: m.court,
    })),
    pairs,
    courts
  );
  return {
    schedule: result.schedule,
    errors,
    usedFallback: result.usedFallback,
    seed: result.seed,
  };
}

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

/**
 * Backtracking con cupo de canchas + fallback 8×3.
 * Usa IDs estables (orden lexicográfico + permutación por semilla), nunca nombres.
 */
export function generateCircleRoundRobinScheduleDetailed(
  pairs: Pair[],
  courts: number,
  options?: GenerateRoundRobinOptions
): {
  schedule: ScheduledRoundRobinMatch[];
  usedFallback: boolean;
  seed: number;
} {
  if (pairs.length < 2) {
    return { schedule: [], usedFallback: false, seed: options?.seed ?? 1 };
  }

  const safeCourts = Math.max(1, Math.floor(courts) || 1);
  const baseSeed = options?.seed ?? 1;
  const maxNodes = options?.maxNodes ?? 200_000;
  const maxMs = options?.maxMs ?? 2_000;
  const maxAttempts = options?.maxAttempts ?? 8;
  const n = pairs.length;
  const ordered = [...pairs].sort((a, b) => a.id.localeCompare(b.id));

  let lastError = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = (baseSeed + attempt * 9973) >>> 0;
    const perm = seededPermutation(n, seed);
    const indexed = perm.map((i) => ordered[i]);

    const indexRounds = searchCourtLimitedSchedule(
      n,
      safeCourts,
      seed ^ 0x9e3779b9,
      maxNodes,
      maxMs
    );

    if (!indexRounds) {
      lastError = `Sin solución en intento ${attempt + 1} (seed=${seed}).`;
      continue;
    }

    const schedule = materializeRounds(indexed, indexRounds, safeCourts);
    const errors = validateSchedule(
      schedule.map((m) => ({
        pair1Id: m.pair1.id,
        pair2Id: m.pair2.id,
        round: m.round,
        court: m.court,
      })),
      pairs,
      safeCourts
    );
    if (errors.length === 0) {
      return { schedule, usedFallback: false, seed };
    }
    lastError = errors.join(" | ");
  }

  // Fallback explícito solo para 8/3.
  if (n === 8 && safeCourts === 3) {
    const schedule = buildReferenceSchedule8x3(pairs, baseSeed);
    const errors = validateSchedule(
      schedule.map((m) => ({
        pair1Id: m.pair1.id,
        pair2Id: m.pair2.id,
        round: m.round,
        court: m.court,
      })),
      pairs,
      safeCourts
    );
    if (errors.length === 0) {
      debugLog(
        "[circle-rr] usando calendario de referencia 8×3 (fallback).",
        { seed: baseSeed }
      );
      return { schedule, usedFallback: true, seed: baseSeed };
    }
    throw new Error(
      `Fallback 8×3 inválido: ${errors.join(" | ")}`
    );
  }

  throw new Error(
    `No se encontró un calendario válido para ${n} parejas y ${safeCourts} canchas dentro del límite de búsqueda. ${lastError}`
  );
}

/** Calendario round robin con cupo real de canchas (sin trocear 1-factores). */
export function generateCircleRoundRobinSchedule(
  pairs: Pair[],
  courts: number,
  options?: GenerateRoundRobinOptions
): ScheduledRoundRobinMatch[] {
  return generateCircleRoundRobinScheduleDetailed(pairs, courts, options)
    .schedule;
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
