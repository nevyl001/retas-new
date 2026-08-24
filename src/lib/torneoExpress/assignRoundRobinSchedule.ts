import type { DraftScheduleMatch } from "./draftScheduleMatch";
import {
  SCHEDULE_INCOMPLETE_MSG,
  ScheduleInvariantError,
} from "./scheduleInvariants";
import {
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  programadoIsoFromMexicoCalendar,
} from "./teScheduleTime";

export type AssignRoundRobinScheduleInput = {
  matches: DraftScheduleMatch[];
  courts: string[];
  date: string;
  startTime: string;
  durationMinutes: number;
};

export type SchedulePreviewSummary = {
  matchCount: number;
  courtCount: number;
  blockCount: number;
  startTime: string;
  startDate: string;
  endTime: string;
  endDate: string;
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
  if (a.groupKey !== b.groupKey) return a.groupKey - b.groupKey;
  if (a.ronda !== b.ronda) return a.ronda - b.ronda;
  return a.orden - b.orden;
}

function sortUniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

/**
 * Programa partidos existentes sin alterar enfrentamientos.
 * Orden: grupo → ronda → huecos de cancha; avanza `durationMinutes` entre huecos.
 * Así la duración se nota dentro de cada grupo (ej. 45 → 9:00, 9:45, 10:30).
 */
export function assignRoundRobinSchedule(
  input: AssignRoundRobinScheduleInput
): DraftScheduleMatch[] {
  const { matches, courts, date, startTime, durationMinutes } = input;

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

  const scheduled: DraftScheduleMatch[] = [];
  let slotIndex = 0;
  let currentDate = date;
  let currentTime = startTime;

  const groupKeys = sortUniqueNumbers(matches.map((m) => m.groupKey));

  for (const groupKey of groupKeys) {
    const groupMatches = matches.filter((m) => m.groupKey === groupKey);
    const rounds = sortUniqueNumbers(groupMatches.map((m) => m.ronda));

    for (const ronda of rounds) {
      let pending = groupMatches
        .filter((m) => m.ronda === ronda)
        .sort((a, b) => a.orden - b.orden);

      while (pending.length > 0) {
        const programadoIso = programadoIsoFromMexicoCalendar(
          currentDate,
          currentTime
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
          throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
        }

        for (const { match, court } of scheduledThisSlot) {
          scheduled.push({
            ...match,
            programado_en: programadoIso,
            cancha: court,
          });
        }

        pending = pending.filter(
          (m) => !scheduledThisSlot.some((s) => s.match.matchKey === m.matchKey)
        );

        slotIndex += 1;
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
      }
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
    "date" | "startTime" | "durationMinutes" | "courts"
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
  }

  return {
    matchCount: scheduled.length,
    courtCount: input.courts.length,
    blockCount: slots.length,
    startDate: input.date,
    startTime: input.startTime,
    endDate,
    endTime,
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
