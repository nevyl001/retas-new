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
  courtsForScheduleDay,
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


type CourtOpening = {
  date: string;
  time: string;
  courts: string[];
  blockedLabels: string[];
};

function openingsForDays(
  days: TeScheduleDayWindow[],
  courts: string[],
  durationMinutes: number,
  occupiedCourtKeys: Set<string>,
  occupiedLabels: ReadonlyMap<string, string>
): CourtOpening[] {
  const openings: CourtOpening[] = [];

  for (const day of days) {
    const configured = courtsForScheduleDay(day, courts);
    let time = day.startTime;
    let guard = 0;
    while (
      guard < 48 &&
      slotFitsDailyWindow(time, durationMinutes, day.startTime, day.endTime)
    ) {
      guard += 1;
      const programadoIso = programadoIsoFromMexicoCalendar(day.date, time);
      const blockedLabels: string[] = [];
      const freeCourts = programadoIso
        ? configured.filter((court) => {
            const key = occupiedCourtSlotKey(programadoIso, court);
            if (key && occupiedCourtKeys.has(key)) {
              blockedLabels.push(occupiedLabels.get(key) ?? "");
              return false;
            }
            return true;
          })
        : [];
      openings.push({ date: day.date, time, courts: freeCourts, blockedLabels });
      const next = addMinutesToMexicoCalendar(day.date, time, durationMinutes);
      if (!next || next.date !== day.date) break;
      time = next.time;
    }
  }

  return openings;
}

function formatCourtList(names: string[]): string {
  if (names.length === 0) return "sin canchas";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function capacityFailureMessage(
  matchCount: number,
  days: TeScheduleDayWindow[],
  openings: CourtOpening[],
  fallbackCourts: string[]
): string {
  const free = openings.reduce((sum, opening) => sum + opening.courts.length, 0);
  const first = days[0]?.date ?? "—";
  const last = days[days.length - 1]?.date ?? "—";
  const byDate = new Map<
    string,
    { free: number; labels: Map<string, number> }
  >();
  for (const opening of openings) {
    const row = byDate.get(opening.date) ?? {
      free: 0,
      labels: new Map<string, number>(),
    };
    row.free += opening.courts.length;
    for (const label of opening.blockedLabels) {
      const key = label.trim() || "otra categoría";
      row.labels.set(key, (row.labels.get(key) ?? 0) + 1);
    }
    byDate.set(opening.date, row);
  }

  const detail = days
    .map((day, index) => {
      const names = courtsForScheduleDay(day, fallbackCourts);
      const row = byDate.get(day.date);
      const libres = row?.free ?? 0;
      const occupied = Array.from(row?.labels.entries() ?? []);
      const occupiedText =
        occupied.length > 0
          ? `, ${occupied
              .map(([label, count]) => `${label} ocupa ${count}`)
              .join(", ")}`
          : "";
      return `Día ${index + 1} (${day.date}, ${day.startTime}–${day.endTime}): ${formatCourtList(names)}, ${libres} libres${occupiedText}`;
    })
    .join(". ");

  return `No caben ${matchCount} partidos: quedan ${free} lugares libres (${first} → ${last}). ${detail}.`;
}

function takeMatchesForCourts(
  pool: DraftScheduleMatch[],
  courts: string[],
  programadoIso: string,
  busyPairs: Set<string>,
  occupiedCourtKeys: Set<string>
): DraftScheduleMatch[] {
  const available = [...courts];
  const taken: DraftScheduleMatch[] = [];

  for (const match of pool) {
    if (available.length === 0) break;
    if (
      busyPairs.has(match.parejaLocalId) ||
      busyPairs.has(match.parejaVisitanteId)
    ) {
      continue;
    }
    const court = available.shift()!;
    taken.push({
      ...match,
      programado_en: programadoIso,
      cancha: court,
    });
    busyPairs.add(match.parejaLocalId);
    busyPairs.add(match.parejaVisitanteId);
    const takenKey = occupiedCourtSlotKey(programadoIso, court);
    if (takenKey) occupiedCourtKeys.add(takenKey);
  }

  return taken;
}

/**
 * Cada horario usa todas las canchas libres de ese día.
 * Primero avanza el grupo en curso; si queda una cancha, entra otro grupo.
 */
function assignMatchesOntoDayCourts(
  matches: DraftScheduleMatch[],
  courts: string[],
  durationMinutes: number,
  days: TeScheduleDayWindow[],
  occupiedCourtKeys: Set<string>,
  occupiedLabels: ReadonlyMap<string, string>
): DraftScheduleMatch[] {
  const openings = openingsForDays(
    days,
    courts,
    durationMinutes,
    occupiedCourtKeys,
    occupiedLabels
  );
  let pending = [...matches].sort(
    (a, b) => a.groupKey - b.groupKey || a.ronda - b.ronda || a.orden - b.orden
  );
  const scheduled: DraftScheduleMatch[] = [];
  let activeGroup = pending[0]?.groupKey ?? 0;

  for (const opening of openings) {
    if (pending.length === 0) break;
    if (opening.courts.length === 0) continue;
    const programadoIso = programadoIsoFromMexicoCalendar(opening.date, opening.time);
    if (!programadoIso) continue;

    const preferred = activeGroup;
    const current = pending.some((match) => match.groupKey === preferred)
      ? preferred
      : pending[0]!.groupKey;
    activeGroup = current;

    const busyPairs = new Set<string>();
    const primary = pending.filter((match) => match.groupKey === current);
    const rest = pending.filter((match) => match.groupKey !== current);
    const fromGroup = takeMatchesForCourts(
      primary,
      opening.courts,
      programadoIso,
      busyPairs,
      occupiedCourtKeys
    );
    const used = new Set(fromGroup.map((match) => match.cancha));
    const fromOthers = takeMatchesForCourts(
      rest,
      opening.courts.filter((court) => !used.has(court)),
      programadoIso,
      busyPairs,
      occupiedCourtKeys
    );
    const taken = [...fromGroup, ...fromOthers];
    if (taken.length === 0) continue;

    const takenKeys = new Set(taken.map((match) => match.matchKey));
    pending = pending.filter((match) => !takenKeys.has(match.matchKey));
    scheduled.push(...taken);
  }

  if (pending.length > 0) {
    throw new ScheduleInvariantError(
      capacityFailureMessage(matches.length, days, openings, courts)
    );
  }

  return scheduled.sort(compareMatchesForScheduling);
}

function assignWithDayWindows(
  matches: DraftScheduleMatch[],
  courts: string[],
  durationMinutes: number,
  days: TeScheduleDayWindow[],
  occupiedCourtKeys: Set<string>,
  occupiedLabels: ReadonlyMap<string, string>
): DraftScheduleMatch[] {
  return assignMatchesOntoDayCourts(
    matches,
    courts,
    durationMinutes,
    days,
    occupiedCourtKeys,
    occupiedLabels
  );
}

function occupiedCategoryLabels(
  slots: TeOccupiedCourtSlot[]
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const slot of slots) {
    const key = occupiedCourtSlotKey(slot.programado_en, slot.cancha);
    const label = slot.categoriaLabel?.trim();
    if (key && label && !labels.has(key)) labels.set(key, label);
  }
  return labels;
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
 * Preferido: `days` con apertura, cierre y canchas de ese día.
 * `courts` solo se usa en un día que no trae su propia lista.
 */
export function assignRoundRobinSchedule(
  input: AssignRoundRobinScheduleInput
): DraftScheduleMatch[] {
  const { matches, courts, durationMinutes } = input;

  if (matches.length === 0) return [];
  const dayBackedCourts = (input.days ?? []).some(
    (day) => courtsForScheduleDay(day).length > 0
  );
  if (!courts.length && !dayBackedCourts) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  const occupiedSlots = input.occupiedCourtSlots ?? [];
  const occupiedCourtKeys = buildOccupiedCourtSlotSet(occupiedSlots);
  const occupiedLabels = occupiedCategoryLabels(occupiedSlots);

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
    occupiedCourtKeys,
    occupiedLabels
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

  const usedCourts = new Set<string>();
  for (const slot of slots) {
    for (const match of slot.matches) {
      if (match.cancha) usedCourts.add(match.cancha);
    }
  }

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
    courtCount: usedCourts.size || input.courts.length,
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
