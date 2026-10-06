import type { DraftScheduleMatch } from "./draftScheduleMatch";
import {
  buildOccupiedCourtSlotSet,
  occupiedCourtSlotKey,
  type TeOccupiedCourtSlot,
} from "./courtCheckScope";
import {
  SCHEDULE_INCOMPLETE_MSG,
  ScheduleInvariantError,
} from "./scheduleInvariants";
import {
  normalizePlayDays,
  resolveScheduleDays,
  validatePlayDays,
  type TeScheduleDayWindow,
} from "./scheduleDayWindows";
import {
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  programadoIsoFromMexicoCalendar,
  slotFitsDailyWindow,
} from "./teScheduleTime";

/** Tope de seguridad de iteraciones. */
export const MAX_SCHEDULE_SPAN_DAYS = 60;

export type AssignRoundRobinScheduleInput = {
  matches: DraftScheduleMatch[];
  courts: string[];
  durationMinutes: number;
  /** Días con horario propio (preferido para fase de grupos). */
  days?: TeScheduleDayWindow[];
  /** Legacy: día/hora de inicio. */
  date?: string;
  startTime?: string;
  /** Legacy: cierre uniforme + endDate. Si se omite junto a days, modo abierto. */
  endTime?: string;
  endDate?: string;
  /**
   * Canchas ya ocupadas por otras categorías / partidos que no se reescriben.
   * El motor salta esas canchas en ese horario.
   */
  occupiedCourtSlots?: TeOccupiedCourtSlot[];
};

export type SchedulePreviewSummary = {
  matchCount: number;
  courtCount: number;
  blockCount: number;
  startTime: string;
  startDate: string;
  endTime: string;
  endDate: string;
  dayCount: number;
  slots: SchedulePreviewSlot[];
};

export type SchedulePreviewSlot = {
  slotKey: string;
  date: string;
  time: string;
  matches: Array<
    DraftScheduleMatch & { programado_en: string; cancha: string }
  >;
};

type DayCursor = {
  dayIndex: number;
  time: string;
};

function rotateCourts(courts: string[], slotIndex: number): string[] {
  const n = courts.length;
  if (n === 0) return [];
  const offset = slotIndex % n;
  return [...courts.slice(offset), ...courts.slice(0, offset)];
}

function compareMatchesForScheduling(
  a: DraftScheduleMatch,
  b: DraftScheduleMatch
): number {
  if (a.ronda !== b.ronda) return a.ronda - b.ronda;
  if (a.groupKey !== b.groupKey) return a.groupKey - b.groupKey;
  return a.orden - b.orden;
}

function sortUniqueRounds(matches: DraftScheduleMatch[]): number[] {
  const set = new Set<number>();
  for (const m of matches) set.add(m.ronda);
  return Array.from(set).sort((a, b) => a - b);
}

function interleavePendingByGroup(
  pending: DraftScheduleMatch[]
): DraftScheduleMatch[] {
  const byGroup = new Map<number, DraftScheduleMatch[]>();
  for (const match of pending) {
    const list = byGroup.get(match.groupKey) ?? [];
    list.push(match);
    byGroup.set(match.groupKey, list);
  }
  for (const list of Array.from(byGroup.values())) {
    list.sort((a, b) => a.orden - b.orden);
  }

  const groupKeys = Array.from(byGroup.keys()).sort((a, b) => a - b);
  const interleaved: DraftScheduleMatch[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const groupKey of groupKeys) {
      const list = byGroup.get(groupKey)!;
      if (list.length > 0) {
        interleaved.push(list.shift()!);
        added = true;
      }
    }
  }
  return interleaved;
}

function throwNoCapacity(days: TeScheduleDayWindow[]): never {
  const first = days[0]?.date ?? "—";
  const last = days[days.length - 1]?.date ?? "—";
  throw new ScheduleInvariantError(
    `No caben todos los partidos en los días configurados (${first} → ${last}). Agrega otro día, amplía horarios o añade canchas.`
  );
}

function ensureValidDayCursor(
  days: TeScheduleDayWindow[],
  cursor: DayCursor,
  durationMinutes: number
): DayCursor {
  let { dayIndex, time } = cursor;
  let guard = 0;
  while (dayIndex < days.length && guard < days.length + 2) {
    guard += 1;
    const day = days[dayIndex]!;
    if (
      slotFitsDailyWindow(time, durationMinutes, day.startTime, day.endTime)
    ) {
      return { dayIndex, time };
    }
    dayIndex += 1;
    if (dayIndex < days.length) {
      time = days[dayIndex]!.startTime;
    }
  }
  throwNoCapacity(days);
}

function advanceDayCursor(
  days: TeScheduleDayWindow[],
  cursor: DayCursor,
  durationMinutes: number
): DayCursor {
  const day = days[cursor.dayIndex];
  if (!day) throwNoCapacity(days);

  const next = addMinutesToMexicoCalendar(
    day.date,
    cursor.time,
    durationMinutes
  );
  if (!next) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  if (
    next.date === day.date &&
    slotFitsDailyWindow(next.time, durationMinutes, day.startTime, day.endTime)
  ) {
    return { dayIndex: cursor.dayIndex, time: next.time };
  }

  const nextIndex = cursor.dayIndex + 1;
  if (nextIndex >= days.length) {
    throwNoCapacity(days);
  }
  return ensureValidDayCursor(
    days,
    { dayIndex: nextIndex, time: days[nextIndex]!.startTime },
    durationMinutes
  );
}

function packSlots(
  matches: DraftScheduleMatch[],
  courts: string[],
  nextSlot: () => { date: string; time: string },
  occupiedCourtKeys: Set<string>
): DraftScheduleMatch[] {
  const scheduled: DraftScheduleMatch[] = [];
  let slotIndex = 0;
  const rounds = sortUniqueRounds(matches);

  for (const ronda of rounds) {
    let pending = interleavePendingByGroup(
      matches.filter((m) => m.ronda === ronda)
    );
    let stallGuard = 0;

    while (pending.length > 0) {
      stallGuard += 1;
      if (stallGuard > matches.length * MAX_SCHEDULE_SPAN_DAYS * 4) {
        throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
      }

      const { date, time } = nextSlot();
      const programadoIso = programadoIsoFromMexicoCalendar(date, time);
      if (!programadoIso) {
        throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
      }

      const rotatedCourts = rotateCourts(courts, slotIndex);
      const busyPairs = new Set<string>();
      const availableCourts = rotatedCourts.filter((court) => {
        const key = occupiedCourtSlotKey(programadoIso, court);
        return !key || !occupiedCourtKeys.has(key);
      });
      const scheduledThisSlot: Array<{
        match: DraftScheduleMatch;
        court: string;
      }> = [];

      for (const match of pending) {
        if (availableCourts.length === 0) break;
        if (
          busyPairs.has(match.parejaLocalId) ||
          busyPairs.has(match.parejaVisitanteId)
        ) {
          continue;
        }
        const court = availableCourts.shift()!;
        scheduledThisSlot.push({ match, court });
        busyPairs.add(match.parejaLocalId);
        busyPairs.add(match.parejaVisitanteId);
        const takenKey = occupiedCourtSlotKey(programadoIso, court);
        if (takenKey) occupiedCourtKeys.add(takenKey);
      }

      if (scheduledThisSlot.length === 0) {
        slotIndex += 1;
        continue;
      }

      for (const { match, court } of scheduledThisSlot) {
        scheduled.push({
          ...match,
          programado_en: programadoIso,
          cancha: court,
        });
      }

      const scheduledKeys = new Set(
        scheduledThisSlot.map((slot) => slot.match.matchKey)
      );
      pending = pending.filter((m) => !scheduledKeys.has(m.matchKey));
      slotIndex += 1;
    }
  }

  if (scheduled.length !== matches.length) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  return scheduled.sort(compareMatchesForScheduling);
}

function groupsInOrder(matches: DraftScheduleMatch[]): DraftScheduleMatch[][] {
  const byGroup = new Map<number, DraftScheduleMatch[]>();
  for (const match of matches) {
    const list = byGroup.get(match.groupKey) ?? [];
    list.push(match);
    byGroup.set(match.groupKey, list);
  }
  return Array.from(byGroup.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) =>
      [...list].sort((a, b) => a.ronda - b.ronda || a.orden - b.orden)
    );
}

type GroupPackResult =
  | {
      ok: true;
      placed: DraftScheduleMatch[];
      occupied: Set<string>;
      cursor: DayCursor;
    }
  | { ok: false; reason: "hole" | "next-day" | "no-capacity" };

/**
 * Coloca un grupo entero desde `start`, en slots seguidos y en un solo día.
 * Si el bloque se corta, no deja partidos a medias.
 */
function packOneGroupOnItsStartDay(
  group: DraftScheduleMatch[],
  days: TeScheduleDayWindow[],
  courts: string[],
  durationMinutes: number,
  start: DayCursor,
  occupiedCourtKeys: Set<string>
): GroupPackResult {
  const occupied = new Set(occupiedCourtKeys);
  let pending = [...group];
  let cursor = start;
  let started = false;
  let homeDay = start.dayIndex;
  let slotIndex = 0;
  const placed: DraftScheduleMatch[] = [];
  const limit = Math.max(8, group.length * 6);

  for (let guard = 0; pending.length > 0; guard += 1) {
    if (guard > limit) return { ok: false, reason: "no-capacity" };

    if (started) {
      const prevDay = cursor.dayIndex;
      let next: DayCursor;
      try {
        next = advanceDayCursor(days, cursor, durationMinutes);
      } catch (error) {
        if (error instanceof ScheduleInvariantError) {
          return { ok: false, reason: "no-capacity" };
        }
        throw error;
      }
      if (next.dayIndex !== prevDay) return { ok: false, reason: "next-day" };
      cursor = next;
    } else {
      try {
        cursor = ensureValidDayCursor(days, cursor, durationMinutes);
      } catch (error) {
        if (error instanceof ScheduleInvariantError) {
          return { ok: false, reason: "no-capacity" };
        }
        throw error;
      }
      homeDay = cursor.dayIndex;
      started = true;
    }

    if (cursor.dayIndex !== homeDay) return { ok: false, reason: "next-day" };

    const day = days[cursor.dayIndex];
    if (!day) return { ok: false, reason: "no-capacity" };
    const programadoIso = programadoIsoFromMexicoCalendar(day.date, cursor.time);
    if (!programadoIso) return { ok: false, reason: "no-capacity" };

    const ronda = pending[0]!.ronda;
    const wave = pending.filter((match) => match.ronda === ronda);
    const availableCourts = rotateCourts(courts, slotIndex).filter((court) => {
      const key = occupiedCourtSlotKey(programadoIso, court);
      return !key || !occupied.has(key);
    });
    const busyPairs = new Set<string>();
    const taken: DraftScheduleMatch[] = [];

    for (const match of wave) {
      if (availableCourts.length === 0) break;
      if (
        busyPairs.has(match.parejaLocalId) ||
        busyPairs.has(match.parejaVisitanteId)
      ) {
        continue;
      }
      const court = availableCourts.shift()!;
      taken.push({
        ...match,
        programado_en: programadoIso,
        cancha: court,
      });
      busyPairs.add(match.parejaLocalId);
      busyPairs.add(match.parejaVisitanteId);
      const takenKey = occupiedCourtSlotKey(programadoIso, court);
      if (takenKey) occupied.add(takenKey);
    }

    if (taken.length === 0) return { ok: false, reason: "hole" };

    placed.push(...taken);
    const takenKeys = new Set(taken.map((match) => match.matchKey));
    pending = pending.filter((match) => !takenKeys.has(match.matchKey));
    slotIndex += 1;
  }

  let nextCursor: DayCursor;
  try {
    nextCursor = advanceDayCursor(days, cursor, durationMinutes);
  } catch (error) {
    if (!(error instanceof ScheduleInvariantError)) throw error;
    nextCursor = { dayIndex: days.length, time: "00:00" };
  }

  return { ok: true, placed, occupied, cursor: nextCursor };
}

function assignGroupsOnTheirStartDay(
  matches: DraftScheduleMatch[],
  courts: string[],
  durationMinutes: number,
  days: TeScheduleDayWindow[],
  occupiedCourtKeys: Set<string>
): DraftScheduleMatch[] {
  const scheduled: DraftScheduleMatch[] = [];
  let occupied = new Set(occupiedCourtKeys);
  let cursor: DayCursor = ensureValidDayCursor(
    days,
    { dayIndex: 0, time: days[0]!.startTime },
    durationMinutes
  );

  for (const group of groupsInOrder(matches)) {
    let placedGroup = false;
    let guard = 0;

    while (!placedGroup) {
      guard += 1;
      if (guard > days.length * 48) throwNoCapacity(days);
      if (cursor.dayIndex >= days.length) throwNoCapacity(days);
      cursor = ensureValidDayCursor(days, cursor, durationMinutes);

      const result = packOneGroupOnItsStartDay(
        group,
        days,
        courts,
        durationMinutes,
        cursor,
        occupied
      );

      if (result.ok) {
        scheduled.push(...result.placed);
        occupied = result.occupied;
        cursor = result.cursor;
        placedGroup = true;
        continue;
      }

      if (result.reason === "no-capacity") throwNoCapacity(days);

      if (result.reason === "hole") {
        try {
          cursor = advanceDayCursor(days, cursor, durationMinutes);
        } catch (error) {
          if (error instanceof ScheduleInvariantError) throwNoCapacity(days);
          throw error;
        }
        continue;
      }

      const nextIndex = cursor.dayIndex + 1;
      if (nextIndex >= days.length) throwNoCapacity(days);
      cursor = ensureValidDayCursor(
        days,
        { dayIndex: nextIndex, time: days[nextIndex]!.startTime },
        durationMinutes
      );
    }
  }

  occupiedCourtKeys.clear();
  for (const key of Array.from(occupied)) occupiedCourtKeys.add(key);

  if (scheduled.length !== matches.length) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  return scheduled.sort(compareMatchesForScheduling);
}

function assignWithDayWindows(
  matches: DraftScheduleMatch[],
  courts: string[],
  durationMinutes: number,
  days: TeScheduleDayWindow[],
  occupiedCourtKeys: Set<string>
): DraftScheduleMatch[] {
  return assignGroupsOnTheirStartDay(
    matches,
    courts,
    durationMinutes,
    days,
    occupiedCourtKeys
  );
}

/** Legacy: sin cierre, avanza solo con duración (puede cruzar medianoche). */
function assignOpenEnded(
  matches: DraftScheduleMatch[],
  courts: string[],
  durationMinutes: number,
  date: string,
  startTime: string,
  occupiedCourtKeys: Set<string>
): DraftScheduleMatch[] {
  if (!programadoIsoFromMexicoCalendar(date, startTime)) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  let currentDate = date;
  let currentTime = startTime;
  let prepared = false;

  return packSlots(
    matches,
    courts,
    () => {
      if (prepared) {
        const next = addMinutesToMexicoCalendar(
          currentDate,
          currentTime,
          durationMinutes
        );
        if (!next) {
          throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
        }
        currentDate = next.date;
        currentTime = next.time;
      } else {
        prepared = true;
      }
      return { date: currentDate, time: currentTime };
    },
    occupiedCourtKeys
  );
}

/**
 * Programa partidos existentes sin alterar enfrentamientos ni rondas.
 * Preferido: `days` con apertura/cierre por día.
 */
export function assignRoundRobinSchedule(
  input: AssignRoundRobinScheduleInput
): DraftScheduleMatch[] {
  const { matches, courts, durationMinutes } = input;

  if (matches.length === 0) return [];
  if (!courts.length) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  const occupiedCourtKeys = buildOccupiedCourtSlotSet(
    input.occupiedCourtSlots ?? []
  );

  const hasExplicitDays = Boolean(input.days && input.days.length > 0);
  const hasEndWindow = Boolean(input.endTime?.trim()) || hasExplicitDays;

  if (!hasEndWindow) {
    const date = (input.date || "").trim();
    const startTime = (input.startTime || "").trim();
    if (!date || !startTime) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }
    return assignOpenEnded(
      matches,
      courts,
      durationMinutes,
      date,
      startTime,
      occupiedCourtKeys
    );
  }

  const days = hasExplicitDays
    ? normalizePlayDays(input.days)
    : resolveScheduleDays({
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        endDate: input.endDate,
      });

  const daysError = validatePlayDays(days, durationMinutes);
  if (daysError) {
    throw new ScheduleInvariantError(daysError);
  }

  return assignWithDayWindows(
    matches,
    courts,
    durationMinutes,
    days,
    occupiedCourtKeys
  );
}

export function buildSchedulePreviewSummary(
  scheduled: DraftScheduleMatch[],
  input: {
    date?: string;
    startTime?: string;
    durationMinutes: number;
    courts: string[];
    days?: TeScheduleDayWindow[];
  }
): SchedulePreviewSummary {
  const slotsMap = new Map<string, SchedulePreviewSlot>();

  for (const match of scheduled) {
    if (!match.programado_en || !match.cancha) continue;
    const slotKey = mexicoScheduleSlotKey(match.programado_en);
    const existing = slotsMap.get(slotKey);
    const enriched = match as DraftScheduleMatch & {
      programado_en: string;
      cancha: string;
    };
    if (existing) {
      existing.matches.push(enriched);
    } else {
      slotsMap.set(slotKey, {
        slotKey,
        date: slotKey.slice(0, 10),
        time: slotKey.slice(11),
        matches: [enriched],
      });
    }
  }

  const slots = Array.from(slotsMap.values()).sort((a, b) =>
    a.slotKey.localeCompare(b.slotKey)
  );

  const fallbackDate = input.days?.[0]?.date ?? input.date ?? "";
  const fallbackStart = input.days?.[0]?.startTime ?? input.startTime ?? "";
  let endDate = fallbackDate;
  let endTime = fallbackStart;
  const daySet = new Set<string>();

  if (slots.length > 0) {
    const last = slots[slots.length - 1]!;
    endDate = last.date;
    endTime = last.time;
    const next = addMinutesToMexicoCalendar(
      last.date,
      last.time,
      input.durationMinutes
    );
    if (next) {
      endDate = next.date;
      endTime = next.time;
    }
    for (const slot of slots) daySet.add(slot.date);
  }

  return {
    matchCount: scheduled.length,
    courtCount: input.courts.length,
    blockCount: slots.length,
    startDate: slots[0]?.date ?? fallbackDate,
    startTime: slots[0]?.time ?? fallbackStart,
    endDate,
    endTime,
    dayCount: Math.max(1, daySet.size),
    slots,
  };
}

export function validateCourtNames(names: string[]): string | null {
  const trimmed = names.map((n) => n.trim());
  if (trimmed.some((n) => !n)) {
    return "Todas las canchas deben tener un nombre.";
  }
  const lower = trimmed.map((n) => n.toLowerCase());
  const unique = new Set(lower);
  if (unique.size !== lower.length) {
    return "Los nombres de cancha deben ser únicos.";
  }
  return null;
}

export function normalizeCourtNames(names: string[]): string[] {
  return names.map((n) => n.trim()).filter(Boolean);
}

export function defaultCourtNames(count: number): string[] {
  const n = Math.max(1, Math.min(8, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => `Cancha ${i + 1}`);
}

export function validateScheduleWindow(
  startTime: string,
  endTime: string,
  durationMinutes: number
): string | null {
  return validatePlayDays(
    [{ date: "2000-01-01", startTime, endTime }],
    durationMinutes
  );
}
