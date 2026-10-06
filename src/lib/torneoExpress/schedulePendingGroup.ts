import { canchaSlotKey } from "./partidoCourtSlotConflict";
import { slotOfPair, type RosterSlot } from "./groupRoster";
import {
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  programadoIsoFromMexicoCalendar,
  slotFitsDailyWindow,
} from "./teScheduleTime";
import {
  courtsForScheduleDay,
  type TeScheduleDayWindow,
} from "./scheduleDayWindows";

/**
 * Pesos. Un consecutivo pesa más que mover un pendiente o alargar el día.
 * El índice tardío solo desempata calendarios igual de justos.
 */
export const SCHEDULE_WEIGHTS = {
  consecutive: 1000,
  restSpread: 50,
  move: 100,
  lateIndex: 1,
} as const;

export type ScheduleMode = "faltantes" | "reorganizar";

export type CourtTimeSlot = {
  programadoEn: string;
  cancha: string;
};

export type ScheduleMatch = {
  id: string;
  localId: string;
  visitanteId: string;
  played: boolean;
  cancha: string | null;
  programadoEn: string | null;
  ronda: number | null;
  orden: number | null;
};

export type ScheduleAssignment = {
  matchId: string;
  cancha: string;
  programadoEn: string;
  orden: number;
};

export type ScheduleMetrics = {
  moved: number;
  consecutives: number;
  minRest: number | null;
  maxRest: number | null;
  slotsUsed: number;
  holes: number;
  lastTimeKey: string | null;
  cost: number;
};

export type SchedulePlan =
  | {
      ok: true;
      assignments: ScheduleAssignment[];
      unscheduled: [];
      metrics: ScheduleMetrics;
    }
  | {
      ok: false;
      error: "INSUFFICIENT_SLOTS";
      assignments: [];
      unscheduled: string[];
      availableSlots: number;
      fixedCount: number;
    };

type Placed = {
  matchId: string;
  timeKey: string;
  canchaKey: string;
  cancha: string;
  programadoEn: string;
};

function competitiveId(slots: RosterSlot[], pairId: string): string {
  return slotOfPair(slots, pairId)?.parejaId ?? pairId;
}

function timeKeyOf(iso: string): string | null {
  try {
    return mexicoScheduleSlotKey(iso);
  } catch {
    return null;
  }
}

function isScheduled(match: ScheduleMatch): boolean {
  return Boolean(match.programadoEn?.trim() && match.cancha?.trim());
}

export function buildCourtTimeOpenings(input: {
  days: TeScheduleDayWindow[];
  courts: string[];
  durationMinutes: number;
  nowIso?: string | null;
}): CourtTimeSlot[] {
  const nowKey = input.nowIso ? timeKeyOf(input.nowIso) : null;
  const openings: CourtTimeSlot[] = [];
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of days) {
    const courts = [...courtsForScheduleDay(day, input.courts)].sort((a, b) => {
      const byKey = canchaSlotKey(a).localeCompare(canchaSlotKey(b));
      return byKey === 0 ? a.localeCompare(b) : byKey;
    });
    let time = day.startTime;
    let guard = 0;
    while (
      guard < 500 &&
      slotFitsDailyWindow(time, input.durationMinutes, day.startTime, day.endTime)
    ) {
      guard += 1;
      const iso = programadoIsoFromMexicoCalendar(day.date, time);
      if (!iso) break;
      const key = timeKeyOf(iso);
      if (key && (nowKey == null || key >= nowKey)) {
        for (const cancha of courts) {
          openings.push({ programadoEn: iso, cancha });
        }
      }
      const next = addMinutesToMexicoCalendar(day.date, time, input.durationMinutes);
      if (!next || next.date !== day.date) break;
      time = next.time;
    }
  }
  return openings;
}

function occupyKey(timeKey: string, canchaKey: string): string {
  return `${timeKey}|${canchaKey}`;
}

export function schedulePendingGroup(input: {
  matches: ScheduleMatch[];
  slots: RosterSlot[];
  openings: CourtTimeSlot[];
  nowIso: string;
  mode: ScheduleMode;
  occupied?: CourtTimeSlot[];
}): SchedulePlan {
  const nowKey = timeKeyOf(input.nowIso);
  const matches = [...input.matches].sort((a, b) => a.id.localeCompare(b.id));
  const lineages = new Map<string, [string, string]>();
  for (const match of matches) {
    lineages.set(match.id, [
      competitiveId(input.slots, match.localId),
      competitiveId(input.slots, match.visitanteId),
    ]);
  }

  const openings = input.openings
    .map((opening) => {
      const key = timeKeyOf(opening.programadoEn);
      const canchaKey = canchaSlotKey(opening.cancha);
      if (!key || !canchaKey) return null;
      if (nowKey != null && key < nowKey) return null;
      return { ...opening, timeKey: key, canchaKey };
    })
    .filter((opening): opening is CourtTimeSlot & { timeKey: string; canchaKey: string } => opening != null)
    .sort((a, b) => {
      if (a.timeKey !== b.timeKey) return a.timeKey < b.timeKey ? -1 : 1;
      return a.canchaKey.localeCompare(b.canchaKey);
    });

  const waves = Array.from(new Set(openings.map((opening) => opening.timeKey)));
  const waveIndex = new Map(waves.map((wave, index) => [wave, index]));

  const courtTaken = new Set<string>();
  const lineageAt = new Map<string, Set<string>>();
  const placed = new Map<string, Placed>();
  const previous = new Map<string, { timeKey: string; canchaKey: string }>();

  const block = (timeKey: string, canchaKey: string, left: string, right: string, matchId: string | null, programadoEn: string, cancha: string) => {
    courtTaken.add(occupyKey(timeKey, canchaKey));
    for (const id of [left, right]) {
      const set = lineageAt.get(timeKey) ?? new Set<string>();
      set.add(id);
      lineageAt.set(timeKey, set);
    }
    if (matchId) {
      placed.set(matchId, { matchId, timeKey, canchaKey, cancha, programadoEn });
    }
  };

  for (const busy of input.occupied ?? []) {
    const key = timeKeyOf(busy.programadoEn);
    const canchaKey = canchaSlotKey(busy.cancha);
    if (key && canchaKey) courtTaken.add(occupyKey(key, canchaKey));
  }

  const fixed: ScheduleMatch[] = [];
  const movable: ScheduleMatch[] = [];
  for (const match of matches) {
    if (match.played) {
      fixed.push(match);
      continue;
    }
    if (input.mode === "faltantes" && isScheduled(match)) fixed.push(match);
    else movable.push(match);
  }

  for (const match of fixed) {
    if (!isScheduled(match)) continue;
    const key = timeKeyOf(match.programadoEn as string);
    const canchaKey = canchaSlotKey(match.cancha);
    if (!key || !canchaKey) continue;
    const [left, right] = lineages.get(match.id) ?? [match.localId, match.visitanteId];
    block(key, canchaKey, left, right, match.id, match.programadoEn as string, match.cancha as string);
    previous.set(match.id, { timeKey: key, canchaKey });
  }

  const feasibleCount = (match: ScheduleMatch, takenCourts: Set<string>, takenLineage: Map<string, Set<string>>): number => {
    const [left, right] = lineages.get(match.id) ?? [match.localId, match.visitanteId];
    let count = 0;
    for (const opening of openings) {
      if (takenCourts.has(occupyKey(opening.timeKey, opening.canchaKey))) continue;
      const busy = takenLineage.get(opening.timeKey);
      if (busy && (busy.has(left) || busy.has(right))) continue;
      count += 1;
    }
    return count;
  };

  for (const match of movable) {
    if (!isScheduled(match)) continue;
    const key = timeKeyOf(match.programadoEn as string);
    const canchaKey = canchaSlotKey(match.cancha);
    if (key && canchaKey) previous.set(match.id, { timeKey: key, canchaKey });
  }

  movable.sort((a, b) => {
    const byRoom = feasibleCount(a, courtTaken, lineageAt) - feasibleCount(b, courtTaken, lineageAt);
    return byRoom === 0 ? a.id.localeCompare(b.id) : byRoom;
  });

  const unscheduled: string[] = [];
  for (const match of movable) {
    const [left, right] = lineages.get(match.id) ?? [match.localId, match.visitanteId];
    let best: (typeof openings)[number] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const opening of openings) {
      if (courtTaken.has(occupyKey(opening.timeKey, opening.canchaKey))) continue;
      const busy = lineageAt.get(opening.timeKey);
      if (busy && (busy.has(left) || busy.has(right))) continue;
      const score = placementScore(opening.timeKey, left, right, waveIndex, placed, lineages, previous.get(match.id), opening.canchaKey);
      if (
        score < bestScore
        || (score === bestScore && best != null && `${opening.timeKey}|${opening.canchaKey}` < `${best.timeKey}|${best.canchaKey}`)
      ) {
        best = opening;
        bestScore = score;
      }
    }
    if (!best) {
      unscheduled.push(match.id);
      continue;
    }
    block(best.timeKey, best.canchaKey, left, right, match.id, best.programadoEn, best.cancha);
  }

  if (unscheduled.length > 0) {
    return {
      ok: false,
      error: "INSUFFICIENT_SLOTS",
      assignments: [],
      unscheduled,
      availableSlots: openings.length,
      fixedCount: fixed.length,
    };
  }

  const improve = () => {
    let improved = false;
    const order = movable.map((match) => match.id).sort((a, b) => a.localeCompare(b));
    for (const matchId of order) {
      const current = placed.get(matchId);
      if (!current) continue;
      const [left, right] = lineages.get(matchId) ?? ["", ""];
      let bestOpening: (typeof openings)[number] | null = null;
      let bestCost = totalCost(placed, lineages, waveIndex, previous);
      for (const opening of openings) {
        if (opening.timeKey === current.timeKey && opening.canchaKey === current.canchaKey) continue;
        if (!canMove(matchId, opening.timeKey, opening.canchaKey, left, right, placed, lineages, courtTaken, lineageAt)) continue;
        const trial = new Map(placed);
        trial.set(matchId, {
          matchId,
          timeKey: opening.timeKey,
          canchaKey: opening.canchaKey,
          cancha: opening.cancha,
          programadoEn: opening.programadoEn,
        });
        const nextCost = totalCost(trial, lineages, waveIndex, previous);
        if (nextCost < bestCost) {
          bestCost = nextCost;
          bestOpening = opening;
        }
      }
      if (bestOpening) {
        release(matchId, placed, courtTaken, lineageAt, lineages);
        block(bestOpening.timeKey, bestOpening.canchaKey, left, right, matchId, bestOpening.programadoEn, bestOpening.cancha);
        improved = true;
      }
    }
    return improved;
  };

  for (let pass = 0; pass < 8; pass += 1) {
    if (!improve()) break;
  }

  const playedMaxOrden = matches
    .filter((match) => match.played)
    .reduce((max, match) => Math.max(max, match.orden ?? 0), 0);
  const pendingPlaced = matches
    .filter((match) => !match.played)
    .map((match) => ({ match, place: placed.get(match.id) }))
    .filter((row): row is { match: ScheduleMatch; place: Placed } => row.place != null);

  const assignments: ScheduleAssignment[] = [];
  if (input.mode === "reorganizar") {
    const ordered = [...pendingPlaced].sort((a, b) => {
      if (a.place.timeKey !== b.place.timeKey) return a.place.timeKey < b.place.timeKey ? -1 : 1;
      if (a.place.canchaKey !== b.place.canchaKey) return a.place.canchaKey.localeCompare(b.place.canchaKey);
      return a.match.id.localeCompare(b.match.id);
    });
    ordered.forEach((row, index) => {
      const orden = playedMaxOrden + index + 1;
      const sameTime = timeKeyOf(row.match.programadoEn ?? "") === row.place.timeKey;
      const sameCourt = canchaSlotKey(row.match.cancha) === row.place.canchaKey && Boolean(row.match.cancha);
      if (sameTime && sameCourt && row.match.orden === orden) return;
      assignments.push({
        matchId: row.match.id,
        cancha: row.place.cancha,
        programadoEn: row.place.programadoEn,
        orden,
      });
    });
  } else {
    const newcomers = pendingPlaced
      .filter((row) => !isScheduled(row.match))
      .sort((a, b) => {
        if (a.place.timeKey !== b.place.timeKey) return a.place.timeKey < b.place.timeKey ? -1 : 1;
        return a.place.canchaKey.localeCompare(b.place.canchaKey) || a.match.id.localeCompare(b.match.id);
      });
    const maxOrden = matches.reduce((max, match) => Math.max(max, match.orden ?? 0), 0);
    newcomers.forEach((row, index) => {
      assignments.push({
        matchId: row.match.id,
        cancha: row.place.cancha,
        programadoEn: row.place.programadoEn,
        orden: maxOrden + index + 1,
      });
    });
  }

  return {
    ok: true,
    assignments,
    unscheduled: [],
    metrics: metricsOf(placed, lineages, waveIndex, previous, openings, assignments.length),
  };

  function canMove(
    matchId: string,
    timeKey: string,
    canchaKey: string,
    left: string,
    right: string,
    currentPlaced: Map<string, Placed>,
    currentLineages: Map<string, [string, string]>,
    courts: Set<string>,
    lineage: Map<string, Set<string>>
  ): boolean {
    const own = currentPlaced.get(matchId);
    const courtFree = !courts.has(occupyKey(timeKey, canchaKey)) || (own?.timeKey === timeKey && own.canchaKey === canchaKey);
    if (!courtFree) return false;
    const busy = lineage.get(timeKey);
    if (!busy) return true;
    const leaving = own?.timeKey === timeKey;
    const still = (id: string) => {
      if (!busy.has(id)) return false;
      if (!leaving) return true;
      const [ownLeft, ownRight] = currentLineages.get(matchId) ?? ["", ""];
      return id !== ownLeft && id !== ownRight;
    };
    return !still(left) && !still(right);
  }
}

function release(
  matchId: string,
  placed: Map<string, Placed>,
  courts: Set<string>,
  lineage: Map<string, Set<string>>,
  lineages: Map<string, [string, string]>
): void {
  const current = placed.get(matchId);
  if (!current) return;
  courts.delete(occupyKey(current.timeKey, current.canchaKey));
  const [left, right] = lineages.get(matchId) ?? ["", ""];
  const set = lineage.get(current.timeKey);
  if (set) {
    set.delete(left);
    set.delete(right);
  }
  placed.delete(matchId);
}

function placementScore(
  timeKey: string,
  left: string,
  right: string,
  waveIndex: Map<string, number>,
  placed: Map<string, Placed>,
  lineages: Map<string, [string, string]>,
  previous: { timeKey: string; canchaKey: string } | undefined,
  canchaKey: string
): number {
  const wave = waveIndex.get(timeKey) ?? 0;
  let score = wave * SCHEDULE_WEIGHTS.lateIndex;
  if (previous && (previous.timeKey !== timeKey || previous.canchaKey !== canchaKey)) {
    score += SCHEDULE_WEIGHTS.move;
  }
  for (const entry of Array.from(placed)) {
    const matchId = entry[0];
    const place = entry[1];
    const pair = lineages.get(matchId);
    if (!pair) continue;
    if (pair[0] !== left && pair[1] !== left && pair[0] !== right && pair[1] !== right) continue;
    const other = waveIndex.get(place.timeKey);
    if (other == null) continue;
    if (Math.abs(other - wave) === 1) score += SCHEDULE_WEIGHTS.consecutive;
  }
  return score;
}

function restsOf(
  placed: Map<string, Placed>,
  lineages: Map<string, [string, string]>,
  waveIndex: Map<string, number>
): { consecutives: number; minRest: number | null; maxRest: number | null; spread: number } {
  const bySlot = new Map<string, number[]>();
  for (const entry of Array.from(placed)) {
    const matchId = entry[0];
    const place = entry[1];
    const pair = lineages.get(matchId);
    if (!pair) continue;
    const wave = waveIndex.get(place.timeKey);
    if (wave == null) continue;
    for (const id of pair) {
      const list = bySlot.get(id) ?? [];
      list.push(wave);
      bySlot.set(id, list);
    }
  }
  let consecutives = 0;
  let minRest: number | null = null;
  let maxRest: number | null = null;
  let spread = 0;
  for (const waves of Array.from(bySlot.values())) {
    const ordered = Array.from(new Set(waves)).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const gap = ordered[i]! - ordered[i - 1]!;
      gaps.push(gap);
      if (gap === 1) consecutives += 1;
      minRest = minRest == null ? gap : Math.min(minRest, gap);
      maxRest = maxRest == null ? gap : Math.max(maxRest, gap);
    }
    if (gaps.length >= 2) {
      spread += Math.max(...gaps) - Math.min(...gaps);
    }
  }
  return { consecutives, minRest, maxRest, spread };
}

function totalCost(
  placed: Map<string, Placed>,
  lineages: Map<string, [string, string]>,
  waveIndex: Map<string, number>,
  previous: Map<string, { timeKey: string; canchaKey: string }>
): number {
  const rests = restsOf(placed, lineages, waveIndex);
  let moves = 0;
  let late = 0;
  for (const entry of Array.from(placed)) {
    const matchId = entry[0];
    const place = entry[1];
    late += waveIndex.get(place.timeKey) ?? 0;
    const prior = previous.get(matchId);
    if (prior && (prior.timeKey !== place.timeKey || prior.canchaKey !== place.canchaKey)) moves += 1;
  }
  return (
    rests.consecutives * SCHEDULE_WEIGHTS.consecutive +
    rests.spread * SCHEDULE_WEIGHTS.restSpread +
    moves * SCHEDULE_WEIGHTS.move +
    late * SCHEDULE_WEIGHTS.lateIndex
  );
}

function metricsOf(
  placed: Map<string, Placed>,
  lineages: Map<string, [string, string]>,
  waveIndex: Map<string, number>,
  previous: Map<string, { timeKey: string; canchaKey: string }>,
  openings: Array<{ timeKey: string; canchaKey: string }>,
  moved: number
): ScheduleMetrics {
  const rests = restsOf(placed, lineages, waveIndex);
  const used = new Set(Array.from(placed.values()).map((place) => occupyKey(place.timeKey, place.canchaKey)));
  const usedWaves = Array.from(placed.values())
    .map((place) => waveIndex.get(place.timeKey))
    .filter((wave): wave is number => wave != null);
  const first = usedWaves.length ? Math.min(...usedWaves) : null;
  const last = usedWaves.length ? Math.max(...usedWaves) : null;
  let holes = 0;
  if (first != null && last != null) {
    for (const opening of openings) {
      const wave = waveIndex.get(opening.timeKey);
      if (wave == null || wave <= first || wave >= last) continue;
      if (!used.has(occupyKey(opening.timeKey, opening.canchaKey))) holes += 1;
    }
  }
  const lastTimeKey = last == null
    ? null
    : Array.from(waveIndex.entries()).find(([, index]) => index === last)?.[0] ?? null;
  return {
    moved,
    consecutives: rests.consecutives,
    minRest: rests.minRest,
    maxRest: rests.maxRest,
    slotsUsed: used.size,
    holes,
    lastTimeKey,
    cost: totalCost(placed, lineages, waveIndex, previous),
  };
}

export function scheduleHasCourtConflict(assignments: Array<{ programadoEn: string; cancha: string }>): boolean {
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const key = timeKeyOf(assignment.programadoEn);
    const court = canchaSlotKey(assignment.cancha);
    if (!key || !court) continue;
    const token = occupyKey(key, court);
    if (seen.has(token)) return true;
    seen.add(token);
  }
  return false;
}

export function scheduleHasLineageConflict(
  matches: Array<{ id: string; localId: string; visitanteId: string; programadoEn: string }>,
  slots: RosterSlot[]
): boolean {
  const at = new Map<string, Set<string>>();
  for (const match of matches) {
    const key = timeKeyOf(match.programadoEn);
    if (!key) continue;
    const ids = [competitiveId(slots, match.localId), competitiveId(slots, match.visitanteId)];
    const set = at.get(key) ?? new Set<string>();
    for (const id of ids) {
      if (set.has(id)) return true;
      set.add(id);
    }
    at.set(key, set);
  }
  return false;
}
