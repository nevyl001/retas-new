import {
  addDaysToMexicoCalendarDate,
  mexicoTimeToMinutes,
  slotFitsDailyWindow,
  todayMexicoDateInput,
} from "./teScheduleTime";

export type TeScheduleDayWindow = {
  date: string;
  startTime: string;
  endTime: string;
};

export const DEFAULT_DAY_START_TIME = "09:00";
export const DEFAULT_DAY_END_TIME = "21:00";

export function defaultScheduleDay(
  date: string = todayMexicoDateInput()
): TeScheduleDayWindow {
  return {
    date,
    startTime: DEFAULT_DAY_START_TIME,
    endTime: DEFAULT_DAY_END_TIME,
  };
}

/** Expande un rango uniforme (legacy) a un día por fecha. */
export function expandUniformPlayDays(input: {
  playDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
}): TeScheduleDayWindow[] {
  const playDate = input.playDate.trim();
  const endDate = (input.endDate?.trim() || playDate) < playDate
    ? playDate
    : input.endDate?.trim() || playDate;
  const startTime = input.startTime.trim() || DEFAULT_DAY_START_TIME;
  const endTime = input.endTime.trim() || DEFAULT_DAY_END_TIME;

  const days: TeScheduleDayWindow[] = [];
  let cursor = playDate;
  let guard = 0;
  while (cursor && cursor <= endDate && guard < 60) {
    days.push({ date: cursor, startTime, endTime });
    cursor = addDaysToMexicoCalendarDate(cursor, 1) ?? "";
    guard += 1;
  }
  return days.length > 0 ? days : [defaultScheduleDay(playDate || todayMexicoDateInput())];
}

export function normalizePlayDays(
  raw: unknown,
  fallback: TeScheduleDayWindow[] = [defaultScheduleDay()]
): TeScheduleDayWindow[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback.map((d) => ({ ...d }));
  }

  const cleaned: TeScheduleDayWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<TeScheduleDayWindow>;
    const date = typeof row.date === "string" ? row.date.trim() : "";
    const startTime =
      typeof row.startTime === "string" && row.startTime.trim()
        ? row.startTime.trim()
        : DEFAULT_DAY_START_TIME;
    const endTime =
      typeof row.endTime === "string" && row.endTime.trim()
        ? row.endTime.trim()
        : DEFAULT_DAY_END_TIME;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    cleaned.push({ date, startTime, endTime });
  }

  if (cleaned.length === 0) {
    return fallback.map((d) => ({ ...d }));
  }

  cleaned.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  // Una ventana por fecha (si hay duplicados, gana la última).
  const byDate = new Map<string, TeScheduleDayWindow>();
  for (const day of cleaned) {
    byDate.set(day.date, day);
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

export function validatePlayDays(
  days: TeScheduleDayWindow[],
  durationMinutes: number
): string | null {
  if (!days.length) {
    return "Agrega al menos un día de juego.";
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return "La duración por partido debe ser mayor a 0 minutos.";
  }

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i]!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      return `El día ${i + 1} tiene una fecha inválida.`;
    }
    const start = mexicoTimeToMinutes(day.startTime);
    const end = mexicoTimeToMinutes(day.endTime);
    if (start == null || end == null) {
      return `El día ${day.date} tiene horas inválidas.`;
    }
    if (end <= start) {
      return `En ${day.date}, la hora de cierre debe ser posterior a la de apertura.`;
    }
    if (
      !slotFitsDailyWindow(
        day.startTime,
        durationMinutes,
        day.startTime,
        day.endTime
      )
    ) {
      return `En ${day.date}, la duración no cabe entre ${day.startTime} y ${day.endTime}.`;
    }
  }

  return null;
}

/** Compat: construye days desde input legacy o days explícitos. */
export function resolveScheduleDays(input: {
  days?: TeScheduleDayWindow[];
  date?: string;
  playDate?: string;
  startTime?: string;
  endTime?: string;
  endDate?: string;
}): TeScheduleDayWindow[] {
  if (input.days && input.days.length > 0) {
    return normalizePlayDays(input.days);
  }
  const playDate = (input.playDate || input.date || todayMexicoDateInput()).trim();
  return expandUniformPlayDays({
    playDate,
    endDate: input.endDate,
    startTime: input.startTime || DEFAULT_DAY_START_TIME,
    endTime: input.endTime || DEFAULT_DAY_END_TIME,
  });
}
