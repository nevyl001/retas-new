import type { Match, Pair } from "../db/types";
import { pairPlayersDisplayLabel } from "../pairPlayerNames";
import type { TeamConfigLike } from "../teamConfigDisplay";
import { getPairTeamIndex } from "../teamConfigDisplay";
import {
  assignCourtsInChunk,
  expectedRoundRobinTotals,
} from "../circleRoundRobinSchedule";
import { validateSchedule } from "../roundRobinValidate";

export type RestingPairSwapSlot = {
  matchId: string;
  side: "pair1" | "pair2";
  playingPairId: string;
  court: number | null;
  round: number | null;
};

export type RestingPairSwapPatch = {
  matchId: string;
  updates: Pick<Match, "round" | "court">;
};

export type RestingPairSwapPlan = {
  restingPairId: string;
  playingPairId: string;
  /** Solo round/court: los rivales (pair ids) no se reescriben. */
  patches: RestingPairSwapPatch[];
};

type Edge = { a: number; b: number };

function isMatchLocked(match: Match): boolean {
  if (match.status === "finished") return true;
  if (match.match_type === "championship") return true;
  if (
    typeof match.pair1_score === "number" ||
    typeof match.pair2_score === "number"
  ) {
    return true;
  }
  return false;
}

function edgeKeyIds(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function edgeKeyIdx(e: Edge): string {
  return e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
}

function roundOf(match: Match): number {
  return match.round ?? 0;
}

function playingIdsInMatches(matches: Match[]): Set<string> {
  const playing = new Set<string>();
  for (const m of matches) {
    if (m.pair1_id) playing.add(m.pair1_id);
    if (m.pair2_id) playing.add(m.pair2_id);
  }
  return playing;
}

function restingIdsForRound(
  pairs: Pair[],
  roundMatches: Match[]
): string[] {
  const playing = playingIdsInMatches(roundMatches);
  return pairs.map((p) => p.id).filter((id) => !playing.has(id));
}

/**
 * Parejas jugando en la ronda que se pueden intercambiar con una que descansa
 * (partido no finalizado / sin marcador / no championship).
 */
export function listSwappablePlayingSlots(params: {
  roundMatches: Match[];
  restingPairId: string;
  pairs: Pair[];
  teamConfig?: TeamConfigLike | null;
}): RestingPairSwapSlot[] {
  const { roundMatches, restingPairId, pairs, teamConfig } = params;
  const restingTeam = getPairTeamIndex(
    restingPairId,
    teamConfig,
    pairs.find((p) => p.id === restingPairId) ?? null
  );
  const restrictTeam =
    restingTeam != null && Boolean(teamConfig?.teamNames?.length);

  const slots: RestingPairSwapSlot[] = [];
  for (const match of roundMatches) {
    if (isMatchLocked(match)) continue;
    const candidates: Array<{ side: "pair1" | "pair2"; id: string }> = [
      { side: "pair1", id: match.pair1_id },
      { side: "pair2", id: match.pair2_id },
    ];
    for (const c of candidates) {
      if (!c.id || c.id === restingPairId) continue;
      if (restrictTeam) {
        const playingTeam = getPairTeamIndex(
          c.id,
          teamConfig,
          pairs.find((p) => p.id === c.id) ?? null
        );
        if (playingTeam !== restingTeam) continue;
      }
      slots.push({
        matchId: match.id,
        side: c.side,
        playingPairId: c.id,
        court: match.court ?? null,
        round: match.round ?? null,
      });
    }
  }
  return slots;
}

function applyPatches(
  matches: Match[],
  patches: RestingPairSwapPatch[]
): Match[] {
  const byId = new Map(patches.map((p) => [p.matchId, p.updates]));
  return matches.map((m) => {
    const u = byId.get(m.id);
    if (!u) return m;
    return { ...m, ...u };
  });
}

function scheduleErrors(
  matches: Match[],
  pairs: Pair[],
  courts: number
): string[] {
  return validateSchedule(
    matches.map((m) => ({
      pair1Id: m.pair1_id,
      pair2Id: m.pair2_id,
      round: roundOf(m),
      court: m.court,
    })),
    pairs,
    courts
  );
}

/**
 * Intercambia de ronda el partido de P en K con el de R en L.
 * Conserva rivales; P pasa a descansar en K y R juega; en L al revés.
 */
function tryReciprocalRoundSwap(params: {
  allMatches: Match[];
  pairs: Pair[];
  courts: number;
  round: number;
  restingPairId: string;
  playingPairId: string;
}): RestingPairSwapPlan | null {
  const {
    allMatches,
    pairs,
    courts,
    round: K,
    restingPairId: R,
    playingPairId: P,
  } = params;

  const matchesK = allMatches.filter((m) => roundOf(m) === K);
  if (!matchesK.length || matchesK.some(isMatchLocked)) return null;

  const Mp = matchesK.find((m) => m.pair1_id === P || m.pair2_id === P);
  if (!Mp) return null;
  const X = Mp.pair1_id === P ? Mp.pair2_id : Mp.pair1_id;

  const restK = new Set(restingIdsForRound(pairs, matchesK));
  if (!restK.has(R)) return null;

  const roundNums = Array.from(
    new Set(allMatches.map((m) => roundOf(m)).filter((r) => r > 0))
  ).sort((a, b) => a - b);

  for (const L of roundNums) {
    if (L === K) continue;
    const matchesL = allMatches.filter((m) => roundOf(m) === L);
    if (!matchesL.length || matchesL.some(isMatchLocked)) continue;

    const playingL = playingIdsInMatches(matchesL);
    if (playingL.has(P)) continue;
    if (!playingL.has(R)) continue;
    if (playingL.has(X)) continue;

    const Mr = matchesL.find((m) => m.pair1_id === R || m.pair2_id === R);
    if (!Mr) continue;
    const Y = Mr.pair1_id === R ? Mr.pair2_id : Mr.pair1_id;
    if (!restK.has(Y)) continue;

    const patches: RestingPairSwapPatch[] = [
      {
        matchId: Mp.id,
        updates: { round: L, court: Mr.court ?? Mp.court },
      },
      {
        matchId: Mr.id,
        updates: { round: K, court: Mp.court ?? Mr.court },
      },
    ];

    const next = applyPatches(allMatches, patches);
    const nextRestK = new Set(
      restingIdsForRound(
        pairs,
        next.filter((m) => roundOf(m) === K)
      )
    );
    if (!nextRestK.has(P) || nextRestK.has(R)) continue;

    const errors = scheduleErrors(next, pairs, courts);
    if (errors.length > 0) continue;

    return { restingPairId: R, playingPairId: P, patches };
  }

  return null;
}

function enumerateMatchings(
  pending: Edge[],
  n: number,
  target: number,
  hardCap: number
): Edge[][] {
  if (target <= 0) return [[]];
  const deg = Array.from({ length: n }, () => 0);
  for (const e of pending) {
    deg[e.a] += 1;
    deg[e.b] += 1;
  }
  const ordered = [...pending].sort(
    (x, y) => deg[y.a] + deg[y.b] - (deg[x.a] + deg[x.b])
  );

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

/**
 * Reasigna round/court de partidos pendientes (≥ K) forzando el nuevo set de
 * descansos en K. No toca pair1_id/pair2_id.
 */
function tryRematchPendingRounds(params: {
  allMatches: Match[];
  pairs: Pair[];
  courts: number;
  round: number;
  restingPairId: string;
  playingPairId: string;
}): RestingPairSwapPlan | null {
  const {
    allMatches,
    pairs,
    courts,
    round: K,
    restingPairId: R,
    playingPairId: P,
  } = params;

  const safeCourts = Math.max(1, Math.floor(courts) || 1);
  const n = pairs.length;
  const { rounds: expectedRounds } = expectedRoundRobinTotals(n, safeCourts);
  if (expectedRounds <= 0) return null;

  const rrMatches = allMatches.filter(
    (m) => m.match_type !== "championship" && roundOf(m) > 0
  );
  if (rrMatches.length !== (n * (n - 1)) / 2) {
    // Solo rematch completo cuando el RR clásico está íntegro.
    return null;
  }

  const fromRound = K;
  for (const m of rrMatches) {
    if (roundOf(m) >= fromRound && isMatchLocked(m)) return null;
  }

  const ordered = [...pairs].sort((a, b) => a.id.localeCompare(b.id));
  const indexById = new Map(ordered.map((p, i) => [p.id, i]));
  const idByIndex = ordered.map((p) => p.id);

  const mustRestIdx = indexById.get(P);
  const mustPlayIdx = indexById.get(R);
  if (mustRestIdx == null || mustPlayIdx == null) return null;

  const matchesK = rrMatches.filter((m) => roundOf(m) === K);
  const oldRest = restingIdsForRound(pairs, matchesK);
  if (!oldRest.includes(R) || oldRest.includes(P)) return null;

  // Solo intercambia R↔P en el set de descanso; el resto se conserva.
  const forcedRest = new Set(
    oldRest.filter((id) => id !== R).concat(P).map((id) => indexById.get(id)!)
  );
  if (forcedRest.size !== oldRest.length) return null;
  if (forcedRest.has(mustPlayIdx) || !forcedRest.has(mustRestIdx)) return null;

  const locked = rrMatches.filter((m) => roundOf(m) < fromRound);
  const free = rrMatches.filter((m) => roundOf(m) >= fromRound);

  const pending: Edge[] = [];
  const matchByEdge = new Map<string, Match>();
  for (const m of free) {
    const ia = indexById.get(m.pair1_id);
    const ib = indexById.get(m.pair2_id);
    if (ia == null || ib == null) return null;
    const e = { a: Math.min(ia, ib), b: Math.max(ia, ib) };
    pending.push(e);
    matchByEdge.set(edgeKeyIds(m.pair1_id, m.pair2_id), m);
  }

  const restCount = Array.from({ length: n }, () => 0);
  const lockedRounds: Edge[][] = Array.from(
    { length: fromRound - 1 },
    () => []
  );
  for (const m of locked) {
    const r = roundOf(m);
    const ia = indexById.get(m.pair1_id);
    const ib = indexById.get(m.pair2_id);
    if (ia == null || ib == null || r < 1) return null;
    lockedRounds[r - 1].push({ a: Math.min(ia, ib), b: Math.max(ia, ib) });
  }
  for (let r = 0; r < lockedRounds.length; r += 1) {
    for (const i of restingIndices(n, lockedRounds[r])) {
      restCount[i] += 1;
    }
  }

  const strictEightThree = n === 8 && safeCourts === 3;
  const built: Edge[][] = [];
  const started = Date.now();
  const maxMs = 2_500;
  const maxNodes = 250_000;
  let nodes = 0;

  const dfs = (): boolean => {
    nodes += 1;
    if (nodes > maxNodes || Date.now() - started > maxMs) return false;

    const roundIndex = fromRound - 1 + built.length; // 0-based
    if (pending.length === 0) {
      return roundIndex === expectedRounds;
    }
    if (roundIndex >= expectedRounds) return false;

    const isLast = roundIndex === expectedRounds - 1;
    const remainingRounds = expectedRounds - roundIndex;
    const target = isLast
      ? pending.length
      : Math.min(safeCourts, pending.length);

    if (target > safeCourts) return false;
    if (!isLast && pending.length - target > safeCourts * (remainingRounds - 1)) {
      return false;
    }
    if (!isLast && target !== safeCourts && pending.length >= safeCourts) {
      return false;
    }
    if (strictEightThree) {
      if (roundIndex < 9 && target !== 3) return false;
      if (roundIndex === 9 && target !== 1) return false;
    }

    let candidates = enumerateMatchings(pending, n, target, 500);

    if (roundIndex === fromRound - 1) {
      candidates = candidates.filter((cand) => {
        const rest = restingIndices(n, cand);
        if (rest.length !== forcedRest.size) return false;
        for (const i of rest) {
          if (!forcedRest.has(i)) return false;
        }
        return true;
      });
    }

    const previousRoundEdges =
      roundIndex === 0
        ? null
        : built.length > 0
          ? built[built.length - 1]
          : lockedRounds[roundIndex - 1] ?? null;

    const prevRestSet =
      previousRoundEdges != null
        ? new Set(restingIndices(n, previousRoundEdges))
        : null;

    for (const cand of candidates) {
      const rest = restingIndices(n, cand);

      if (strictEightThree) {
        let restOk = true;
        for (const i of rest) {
          if (restCount[i] >= 3) {
            restOk = false;
            break;
          }
          if (prevRestSet && prevRestSet.has(i)) {
            restOk = false;
            break;
          }
        }
        if (!restOk) continue;

        if (roundIndex === 8) {
          const restSet = new Set(rest);
          const leftover = pending.filter((e) => {
            const inCand = cand.some(
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

      const removedKeys = new Set(cand.map(edgeKeyIdx));
      const kept: Edge[] = [];
      const removed: Edge[] = [];
      for (const e of pending) {
        if (removedKeys.has(edgeKeyIdx(e))) removed.push(e);
        else kept.push(e);
      }
      pending.length = 0;
      pending.push(...kept);
      for (const i of rest) restCount[i] += 1;
      built.push(cand);

      if (dfs()) return true;

      built.pop();
      for (const i of rest) restCount[i] -= 1;
      pending.push(...removed);
    }

    return false;
  };

  if (!dfs()) return null;

  const anchorPairId = ordered[0]?.id;
  const patches: RestingPairSwapPatch[] = [];

  for (let offset = 0; offset < built.length; offset += 1) {
    const timeRound = fromRound + offset;
    const edges = built[offset];
    const chunk = edges.map((e) => ({
      pair1: ordered[e.a],
      pair2: ordered[e.b],
    }));
    const courtsForChunk = assignCourtsInChunk(
      chunk,
      timeRound,
      safeCourts,
      anchorPairId
    );
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i];
      const key = edgeKeyIds(idByIndex[e.a], idByIndex[e.b]);
      const match = matchByEdge.get(key);
      if (!match) return null;
      const nextRound = timeRound;
      const nextCourt = courtsForChunk[i];
      if (match.round === nextRound && match.court === nextCourt) continue;
      patches.push({
        matchId: match.id,
        updates: { round: nextRound, court: nextCourt },
      });
    }
  }

  if (patches.length === 0) {
    // Ya cumplía el descanso pedido.
    return { restingPairId: R, playingPairId: P, patches: [] };
  }

  const next = applyPatches(allMatches, patches);
  const errors = scheduleErrors(next, pairs, safeCourts);
  if (errors.length > 0) return null;

  const nextRestK = restingIdsForRound(
    pairs,
    next.filter((m) => roundOf(m) === K && m.match_type !== "championship")
  );
  if (!nextRestK.includes(P) || nextRestK.includes(R)) return null;

  return { restingPairId: R, playingPairId: P, patches };
}

/**
 * Plan para que `restingPairId` juegue y `playingPairId` descanse en la ronda,
 * reacomodando partidos pendientes sin reescribir rivales.
 */
export function planRestingPairSwap(params: {
  allMatches: Match[];
  roundMatches: Match[];
  round: number;
  restingPairId: string;
  playingPairId: string;
  pairs: Pair[];
  courts: number;
  teamConfig?: TeamConfigLike | null;
}): RestingPairSwapPlan | { error: string } {
  const {
    allMatches,
    roundMatches,
    round,
    restingPairId,
    playingPairId,
    pairs,
    courts,
    teamConfig,
  } = params;

  if (!restingPairId || !playingPairId) {
    return { error: "Selecciona las dos parejas." };
  }
  if (restingPairId === playingPairId) {
    return { error: "Elige una pareja distinta a la que descansa." };
  }

  const restingAlreadyPlaying = roundMatches.some(
    (m) => m.pair1_id === restingPairId || m.pair2_id === restingPairId
  );
  if (restingAlreadyPlaying) {
    return { error: "Esa pareja ya juega en esta ronda." };
  }

  const slots = listSwappablePlayingSlots({
    roundMatches,
    restingPairId,
    pairs,
    teamConfig,
  });
  const slot = slots.find((s) => s.playingPairId === playingPairId);
  if (!slot) {
    const locked = roundMatches.find(
      (m) => m.pair1_id === playingPairId || m.pair2_id === playingPairId
    );
    if (!locked) {
      return { error: "Esa pareja no juega en esta ronda." };
    }
    if (isMatchLocked(locked)) {
      return {
        error:
          "No se puede mover una pareja de un partido ya jugado o de remontada.",
      };
    }
    return {
      error:
        "En modo equipos solo puedes intercambiar con una pareja del mismo equipo.",
    };
  }

  if (roundMatches.some(isMatchLocked)) {
    return {
      error:
        "Esta ronda ya tiene partidos jugados; no se puede reacomodar el descanso.",
    };
  }

  const reciprocal = tryReciprocalRoundSwap({
    allMatches,
    pairs,
    courts,
    round,
    restingPairId,
    playingPairId,
  });
  if (reciprocal) return reciprocal;

  const rematch = tryRematchPendingRounds({
    allMatches,
    pairs,
    courts,
    round,
    restingPairId,
    playingPairId,
  });
  if (rematch) return rematch;

  return {
    error:
      "No se pudo reacomodar sin repetir cruces. Prueba otra pareja o cuando haya más rondas pendientes.",
  };
}

/** @deprecated nombres solo para mensajes UI */
export function restingSwapPairLabel(
  pair: Pair | undefined,
  fallbackId: string
): string {
  if (!pair) return fallbackId;
  return pairPlayersDisplayLabel(pair);
}
