import type { DraftScheduleMatch } from "./draftScheduleMatch";
import {
  SCHEDULE_INCOMPLETE_MSG,
  ScheduleInvariantError,
} from "./scheduleInvariants";
import {
  addDaysToMexicoCalendarDate,
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  mexicoTimeToMinutes,
  programadoIsoFromMexicoCalendar,
  slotFitsDailyWindow,
} from "./teScheduleTime";

/** Tope de seguridad: no programar más de N días naturales. */
export const MAX_SCHEDULE_SPAN_DAYS = 60;

export type AssignRoundRobinScheduleInput = {
  matches: DraftScheduleMatch[];
  courts: string[];
  date: string;
  startTime: string;
  durationMinutes: number;
  /**
   * Hora de cierre de canchas (HH:MM). Si se omite, no hay ventana diaria
   * (comportamiento legacy: puede cruzar medianoche).
   */
  endTime?: string;
  /** Última fecha permitida (YYYY-MM-DD). Por defecto: date + MAX_SCHEDULE_SPAN_DAYS. */
  endDate?: string;
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

/** G1-M1, G2-M1, G1-M2, G2-M2… para repartir canchas en paralelo por grupo. */
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

function resolveMaxDate(startDate: string, endDate?: string): string {
  if (endDate?.trim()) return endDate.trim();
  const capped = addDaysToMexicoCalendarDate(startDate, MAX_SCHEDULE_SPAN_DAYS);
  if (!capped) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }
  return capped;
}

function validateDailyWindow(
  startTime: string,
  endTime: string,
  durationMinutes: number
): void {
  const start = mexicoTimeToMinutes(startTime);
  const end = mexicoTimeToMinutes(endTime);
  if (start == null || end == null) {
    throw new ScheduleInvariantError(
      "Indica una hora de inicio y de cierre válidas (HH:MM)."
    );
  }
  if (end <= start) {
    throw new ScheduleInvariantError(
      "La hora de cierre debe ser posterior a la hora de inicio."
    );
  }
  if (start + durationMinutes > end) {
    throw new ScheduleInvariantError(
      "La duración por partido no cabe en el horario de canchas. Reduce la duración o amplía el cierre."
    );
  }
}

/**
 * Asegura que (date, time) sea un inicio válido dentro de la ventana diaria.
 * Si no cabe, salta al día siguiente a la hora de apertura.
 */
function ensureValidSlotStart(
  date: string,
  time: string,
  startTime: string,
  endTime: string | undefined,
  durationMinutes: number,
  maxDate: string
): { date: string; time: string } {
  if (!endTime) {
    return { date, time };
  }

  let cursorDate = date;
  let cursorTime = time;
  let guard = 0;

  while (guard < MAX_SCHEDULE_SPAN_DAYS + 2) {
    guard += 1;
    if (cursorDate > maxDate) {
      throw new ScheduleInvariantError(
        `No caben todos los partidos antes del ${maxDate}. Amplía el día de fin, añade canchas o reduce la duración.`
      );
    }
    if (
      slotFitsDailyWindow(cursorTime, durationMinutes, startTime, endTime)
    ) {
      return { date: cursorDate, time: cursorTime };
    }
    const nextDate = addDaysToMexicoCalendarDate(cursorDate, 1);
    if (!nextDate) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }
    cursorDate = nextDate;
    cursorTime = startTime;
  }

  throw new ScheduleInvariantError(
    `No caben todos los partidos antes del ${maxDate}. Amplía el día de fin, añade canchas o reduce la duración.`
  );
}

function advanceAfterSlot(
  date: string,
  time: string,
  startTime: string,
  endTime: string | undefined,
  durationMinutes: number,
  maxDate: string
): { date: string; time: string } {
  const next = addMinutesToMexicoCalendar(date, time, durationMinutes);
  if (!next) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  if (!endTime) {
    return next;
  }

  // Si seguimos el mismo día y el siguiente inicio cabe en la ventana, úsalo.
  if (
    next.date === date &&
    slotFitsDailyWindow(next.time, durationMinutes, startTime, endTime)
  ) {
    return next;
  }

  // Cierre del día → abrir al día siguiente a la hora de inicio.
  const nextDate = addDaysToMexicoCalendarDate(date, 1);
  if (!nextDate) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }
  return ensureValidSlotStart(
    nextDate,
    startTime,
    startTime,
    endTime,
    durationMinutes,
    maxDate
  );
}

/**
 * Programa partidos existentes sin alterar enfrentamientos ni rondas.
 * Por ronda, reparte grupos en paralelo sobre las canchas (mismo horario,
 * distinta cancha). Con `endTime`, respeta el horario de cierre y continúa
 * en días siguientes dentro de la misma ventana horaria.
 */
export function assignRoundRobinSchedule(
  input: AssignRoundRobinScheduleInput
): DraftScheduleMatch[] {
  const {
    matches,
    courts,
    date,
    startTime,
    durationMinutes,
    endTime,
    endDate,
  } = input;

  if (matches.length === 0) return [];
  if (!courts.length) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }
  if (!programadoIsoFromMexicoCalendar(date, startTime)) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  const trimmedEnd = endTime?.trim() || undefined;
  if (trimmedEnd) {
    validateDailyWindow(startTime, trimmedEnd, durationMinutes);
  }

  const maxDate = resolveMaxDate(date, endDate);
  if (maxDate < date) {
    throw new ScheduleInvariantError(
      "El día de fin no puede ser anterior al día de inicio."
    );
  }

  const scheduled: DraftScheduleMatch[] = [];
  let slotIndex = 0;
  let cursor = ensureValidSlotStart(
    date,
    startTime,
    startTime,
    trimmedEnd,
    durationMinutes,
    maxDate
  );

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

      cursor = ensureValidSlotStart(
        cursor.date,
        cursor.time,
        startTime,
        trimmedEnd,
        durationMinutes,
        maxDate
      );

      const programadoIso = programadoIsoFromMexicoCalendar(
        cursor.date,
        cursor.time
      );
      if (!programadoIso) {
        throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
      }

      const rotatedCourts = rotateCourts(courts, slotIndex);
      const busyPairs = new Set<string>();
      const availableCourts = [...rotatedCourts];
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
      }

      if (scheduledThisSlot.length === 0) {
        // Conflicto de parejas en este hueco: avanzar horario y reintentar.
        cursor = advanceAfterSlot(
          cursor.date,
          cursor.time,
          startTime,
          trimmedEnd,
          durationMinutes,
          maxDate
        );
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
      cursor = advanceAfterSlot(
        cursor.date,
        cursor.time,
        startTime,
        trimmedEnd,
        durationMinutes,
        maxDate
      );
    }
  }

  if (scheduled.length !== matches.length) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  return scheduled.sort(compareMatchesForScheduling);
}

export function buildSchedulePreviewSummary(
  scheduled: DraftScheduleMatch[],
  input: Pick<
    AssignRoundRobinScheduleInput,
    "date" | "startTime" | "durationMinutes" | "courts" | "endTime"
  >
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

  let endDate = input.date;
  let endTime = input.startTime;
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
    startDate: input.date,
    startTime: input.startTime,
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
  try {
    validateDailyWindow(startTime, endTime, durationMinutes);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Horario de canchas inválido.";
  }
}
