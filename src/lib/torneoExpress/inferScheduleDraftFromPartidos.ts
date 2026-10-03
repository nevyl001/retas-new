import { defaultCourtNames } from "./assignRoundRobinSchedule";
import {
  defaultScheduleDay,
  normalizePlayDays,
  type TeScheduleDayWindow,
} from "./scheduleDayWindows";
import {
  partidoScheduleIso,
  programadoDraftFromPartido,
} from "./partidoSchedule";
import {
  addMinutesToMexicoCalendar,
  todayMexicoDateInput,
} from "./teScheduleTime";
import type { TorneoExpressPartido } from "./types";

export type TeScheduleDraft = {
  days: TeScheduleDayWindow[];
  durationMinutes: number;
  courtCount: number;
  courtNames: string[];
};

const DEFAULT_SCHEDULE: TeScheduleDraft = {
  days: [defaultScheduleDay()],
  durationMinutes: 45,
  courtCount: 2,
  courtNames: defaultCourtNames(2),
};

function normalizeScheduleDraft(
  raw: Partial<TeScheduleDraft> | undefined
): TeScheduleDraft {
  const courtCountRaw = raw?.courtCount;
  const courtCount =
    typeof courtCountRaw === "number" && Number.isFinite(courtCountRaw)
      ? Math.max(1, Math.min(8, Math.floor(courtCountRaw)))
      : DEFAULT_SCHEDULE.courtCount;

  const durationRaw = raw?.durationMinutes;
  const durationMinutes =
    typeof durationRaw === "number" &&
    Number.isFinite(durationRaw) &&
    durationRaw > 0
      ? Math.floor(durationRaw)
      : DEFAULT_SCHEDULE.durationMinutes;

  const existingNames = Array.isArray(raw?.courtNames)
    ? raw!.courtNames.map((n) => (typeof n === "string" ? n : ""))
    : [];

  const courtNames = defaultCourtNames(courtCount).map((fallback, i) => {
    const stored = existingNames[i]?.trim();
    return stored || fallback;
  });

  return {
    days: normalizePlayDays(raw?.days, DEFAULT_SCHEDULE.days),
    durationMinutes,
    courtCount,
    courtNames,
  };
}

function inferDurationMinutes(partidos: TorneoExpressPartido[]): number {
  const uniqueTimes = Array.from(
    new Set(
      partidos
        .map((p) => new Date(partidoScheduleIso(p)).getTime())
        .filter((t) => Number.isFinite(t))
    )
  ).sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 1; i < uniqueTimes.length; i += 1) {
    const gapMinutes = Math.round(
      (uniqueTimes[i]! - uniqueTimes[i - 1]!) / 60_000
    );
    if (gapMinutes >= 15 && gapMinutes <= 180) {
      gaps.push(gapMinutes);
    }
  }

  if (gaps.length === 0) {
    return DEFAULT_SCHEDULE.durationMinutes;
  }

  const counts = new Map<number, number>();
  for (const gap of gaps) {
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }

  let bestGap = gaps[0]!;
  let bestCount = 0;
  for (const [gap, count] of Array.from(counts.entries())) {
    if (count > bestCount || (count === bestCount && gap < bestGap)) {
      bestGap = gap;
      bestCount = count;
    }
  }

  return bestGap;
}

function inferDaysFromPartidos(
  partidos: TorneoExpressPartido[],
  durationMinutes: number
): TeScheduleDayWindow[] {
  const byDate = new Map<string, { min: string; max: string }>();

  for (const partido of partidos) {
    const draft = programadoDraftFromPartido(partido);
    if (!draft.date || !draft.time) continue;
    const existing = byDate.get(draft.date);
    if (!existing) {
      byDate.set(draft.date, { min: draft.time, max: draft.time });
    } else {
      if (draft.time < existing.min) existing.min = draft.time;
      if (draft.time > existing.max) existing.max = draft.time;
    }
  }

  if (byDate.size === 0) {
    return [defaultScheduleDay(todayMexicoDateInput())];
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, times]) => {
      const close =
        addMinutesToMexicoCalendar(date, times.max, durationMinutes) ?? null;
      const endTime =
        close && close.date === date ? close.time : DEFAULT_SCHEDULE.days[0]!.endTime;
      return {
        date,
        startTime: times.min,
        endTime,
      };
    });
}

/** Valores iniciales del editor de programación a partir de partidos existentes. */
export function inferScheduleDraftFromPartidos(
  partidos: TorneoExpressPartido[]
): TeScheduleDraft {
  if (partidos.length === 0) {
    return normalizeScheduleDraft(undefined);
  }

  const pending = partidos.filter((p) => p.estado !== "jugado");
  const source = pending.length > 0 ? pending : partidos;
  const sorted = [...source].sort(
    (a, b) =>
      new Date(partidoScheduleIso(a)).getTime() -
      new Date(partidoScheduleIso(b)).getTime()
  );
  const durationMinutes = inferDurationMinutes(sorted);
  const days = inferDaysFromPartidos(sorted, durationMinutes);

  const courtSet = new Set<string>();
  for (const partido of partidos) {
    const raw = partido.cancha?.trim();
    if (raw) courtSet.add(raw);
  }

  const courtNames =
    courtSet.size > 0
      ? Array.from(courtSet)
      : defaultCourtNames(DEFAULT_SCHEDULE.courtCount);

  return normalizeScheduleDraft({
    days,
    durationMinutes,
    courtCount: courtNames.length,
    courtNames,
  });
}

export function resolveActiveCourtNamesFromDraft(
  schedule: TeScheduleDraft
): string[] {
  return schedule.courtNames.slice(0, schedule.courtCount).map((n) => n.trim());
}
