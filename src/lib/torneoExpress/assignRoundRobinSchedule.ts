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
  for (const list of byGroup.values()) {
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

/**
 * Programa partidos existentes sin alterar enfrentamientos ni rondas.
 * Por ronda, reparte grupos en paralelo sobre las canchas (mismo horario,
 * distinta cancha) para que terminen casi a la par.
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

  const rounds = sortUniqueRounds(matches);

  for (const ronda of rounds) {
    let pending = interleavePendingByGroup(
      matches.filter((m) => m.ronda === ronda)
    );

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

      pending = interleavePendingByGroup(
        pending.filter(
          (m) => !scheduledThisSlot.some((s) => s.match.matchKey === m.matchKey)
        )
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
