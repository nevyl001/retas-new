import {
  assignRoundRobinSchedule,
  normalizeCourtNames,
} from "./assignRoundRobinSchedule";
import {
  buildDraftScheduleMatchKey,
  type DraftScheduleMatch,
} from "./draftScheduleMatch";
import { unorderedMatchupKey } from "./roundRobin";
import {
  ScheduleInvariantError,
  validateScheduleInvariants,
} from "./scheduleInvariants";
import { partidoDateInputValue } from "./partidoSchedule";
import {
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  partidoTimeInputValue24,
} from "./teScheduleTime";

export type ExistingCategoriaMatch = {
  programadoEn: string | null;
  cancha: string | null;
};

export type ExistingGroupMatchup = {
  localId: string;
  visitanteId: string;
  ronda?: number | null;
  orden?: number | null;
};

export type AppendParejaCode = "SCHEDULE_UNAVAILABLE";

export type AppendedParejaMatches =
  | {
      ok: true;
      scheduled: false;
      matches: DraftScheduleMatch[];
    }
  | {
      ok: true;
      scheduled: true;
      matches: DraftScheduleMatch[];
      startDate: string;
      startTime: string;
    }
  | { ok: false; code: AppendParejaCode };

function positiveNumber(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Cruces que faltan entre la pareja nueva y las que ya están en el grupo. */
export function missingMatchupsForNewPair(
  existingPairIds: string[],
  existingMatchups: ExistingGroupMatchup[],
  newPairId: string
): Array<{ localId: string; visitanteId: string }> {
  const incoming = newPairId.trim();
  if (!incoming) return [];

  const played = new Set(
    existingMatchups.map((match) =>
      unorderedMatchupKey(match.localId, match.visitanteId)
    )
  );

  const rivals: string[] = [];
  const seen = new Set<string>();
  for (const raw of existingPairIds) {
    const id = raw.trim();
    if (!id || id === incoming || seen.has(id)) continue;
    seen.add(id);
    const key = unorderedMatchupKey(incoming, id);
    if (played.has(key)) continue;
    rivals.push(id);
  }

  return rivals.map((rivalId) => ({
    localId: incoming,
    visitanteId: rivalId,
  }));
}

/** Draft de los cruces nuevos. No altera ronda ni orden de lo ya existente. */
export function buildAppendedPairDraftMatches(input: {
  groupKey: number;
  grupoNombre: string;
  existingPairIds: string[];
  existingMatchups: ExistingGroupMatchup[];
  newPairId: string;
}): DraftScheduleMatch[] {
  const matchups = missingMatchupsForNewPair(
    input.existingPairIds,
    input.existingMatchups,
    input.newPairId
  );
  const maxRonda = input.existingMatchups.reduce(
    (max, match) => Math.max(max, positiveNumber(match.ronda)),
    0
  );
  const maxOrden = input.existingMatchups.reduce(
    (max, match) => Math.max(max, positiveNumber(match.orden)),
    0
  );
  const ronda = maxRonda + 1;

  return matchups.map((matchup, index) => {
    const orden = maxOrden + index + 1;
    return {
      matchKey: buildDraftScheduleMatchKey({
        groupKey: input.groupKey,
        parejaLocalId: matchup.localId,
        parejaVisitanteId: matchup.visitanteId,
        ronda,
        orden,
      }),
      groupKey: input.groupKey,
      grupoNombre: input.grupoNombre,
      parejaLocalId: matchup.localId,
      parejaVisitanteId: matchup.visitanteId,
      ronda,
      orden,
    };
  });
}

function existingScheduleIsComplete(existing: ExistingCategoriaMatch[]): boolean {
  if (existing.length === 0) return false;
  return existing.every(
    (match) => Boolean(match.programadoEn?.trim()) && Boolean(match.cancha?.trim())
  );
}

function latestMexicoSlot(
  existing: ExistingCategoriaMatch[]
): { date: string; time: string; slotKey: string } | null {
  let bestMs = Number.NEGATIVE_INFINITY;
  let bestIso = "";

  for (const match of existing) {
    const iso = match.programadoEn?.trim();
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    if (ms >= bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }

  if (!bestIso) return null;
  return {
    date: partidoDateInputValue(bestIso),
    time: partidoTimeInputValue24(bestIso),
    slotKey: mexicoScheduleSlotKey(bestIso),
  };
}

/**
 * Programa solo los cruces nuevos, en el slot siguiente al último bloque
 * ya usado por toda la categoría. Una cancha libre en ese bloque no se rellena.
 * Si el calendario actual está incompleto, los nuevos quedan sin horario.
 */
export function appendMatchesAfterExistingSchedule(input: {
  existing: ExistingCategoriaMatch[];
  matches: DraftScheduleMatch[];
  courts: string[];
  durationMinutes: number;
}): AppendedParejaMatches {
  if (input.matches.length === 0) {
    return { ok: true, scheduled: false, matches: [] };
  }

  if (!existingScheduleIsComplete(input.existing)) {
    return {
      ok: true,
      scheduled: false,
      matches: input.matches.map((match) => ({
        ...match,
        programado_en: undefined,
        cancha: undefined,
      })),
    };
  }

  const latest = latestMexicoSlot(input.existing);
  const duration = Math.floor(input.durationMinutes);
  if (!latest || !Number.isFinite(duration) || duration <= 0) {
    return { ok: false, code: "SCHEDULE_UNAVAILABLE" };
  }

  const next = addMinutesToMexicoCalendar(latest.date, latest.time, duration);
  const courts = normalizeCourtNames(input.courts);
  if (!next || courts.length === 0) {
    return { ok: false, code: "SCHEDULE_UNAVAILABLE" };
  }

  try {
    const scheduled = assignRoundRobinSchedule({
      matches: input.matches,
      courts,
      date: next.date,
      startTime: next.time,
      durationMinutes: duration,
    });
    validateScheduleInvariants(input.matches, scheduled);

    for (const match of scheduled) {
      const slotKey = mexicoScheduleSlotKey(match.programado_en!);
      if (slotKey <= latest.slotKey) {
        return { ok: false, code: "SCHEDULE_UNAVAILABLE" };
      }
    }

    return {
      ok: true,
      scheduled: true,
      matches: scheduled,
      startDate: next.date,
      startTime: next.time,
    };
  } catch (error) {
    if (error instanceof ScheduleInvariantError) {
      return { ok: false, code: "SCHEDULE_UNAVAILABLE" };
    }
    throw error;
  }
}
