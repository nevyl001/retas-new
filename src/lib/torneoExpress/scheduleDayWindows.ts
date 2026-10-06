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
  /** Canchas de este día. Si falta, el algoritmo usa la lista global de respaldo. */
  courts?: string[];
};

export const MAX_DAY_COURTS = 8;

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

function readDayCourts(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const names = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .slice(0, MAX_DAY_COURTS);
  return names.length > 0 ? names : undefined;
}

/** Todas las canchas declaradas, sin repetir. Sirve como lista permitida al guardar. */
export function courtsListedOnDays(
  days: TeScheduleDayWindow[],
  fallback: string[] = []
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const day of days) {
    for (const name of courtsForScheduleDay(day, fallback)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/** Canchas efectivas de un día. La lista propia gana sobre el respaldo global. */
export function courtsForScheduleDay(
  day: TeScheduleDayWindow,
  fallback: string[] = []
): string[] {
  const own = (day.courts ?? []).map((name) => name.trim()).filter(Boolean);
  if (own.length > 0) return own;
  return fallback.map((name) => name.trim()).filter(Boolean);
}

/** Rellena canchas solo en días que todavía no traen su propia lista. */
export function attachFallbackCourts(
  days: TeScheduleDayWindow[],
  fallback: string[]
): TeScheduleDayWindow[] {
  const names = fallback.map((name) => name.trim()).filter(Boolean).slice(0, MAX_DAY_COURTS);
  if (names.length === 0) return days;
  return days.map((day) =>
    Array.isArray(day.courts) ? day : { ...day, courts: [...names] }
  );
}

export function resizeDayCourts(
  current: string[] | undefined,
  count: number
): string[] {
  const nextCount = Math.max(
    1,
    Math.min(MAX_DAY_COURTS, Number.isFinite(count) ? Math.floor(count) : 1)
  );
  const names = [...(current ?? [])].slice(0, nextCount);
  const used = new Set(names.map((name) => name.trim().toLowerCase()));
  let nextNumber = 1;
  while (names.length < nextCount) {
    let candidate = `Cancha ${nextNumber}`;
    while (used.has(candidate.toLowerCase())) {
      nextNumber += 1;
      candidate = `Cancha ${nextNumber}`;
    }
    names.push(candidate);
    used.add(candidate.toLowerCase());
    nextNumber += 1;
  }
  return names;
}

function dayCourtNamesError(names: string[], dayNumber: number): string | null {
  const trimmed = names.map((name) => name.trim());
  if (trimmed.length === 0 || trimmed.some((name) => !name)) {
    return `En el día ${dayNumber}, todas las canchas deben tener un nombre.`;
  }
  const lower = trimmed.map((name) => name.toLowerCase());
  if (new Set(lower).size !== lower.length) {
    return `En el día ${dayNumber}, los nombres de cancha deben ser únicos.`;
  }
  return null;
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
    const courts = readDayCourts(row.courts);
    cleaned.push(courts ? { date, startTime, endTime, courts } : { date, startTime, endTime });
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
    if (Array.isArray(day.courts)) {
      const courtError = dayCourtNamesError(day.courts, i + 1);
      if (courtError) return courtError;
    }
  }

  return null;
}

/**
 * Días listos para programar: cada uno conserva sus canchas
 * y, si no trae lista, hereda el respaldo global.
 */
export function resolveScheduledPlayDays(
  rawDays: unknown,
  fallbackCourts: string[],
  durationMinutes: number
): { days: TeScheduleDayWindow[]; courts: string[] } {
  const days = attachFallbackCourts(normalizePlayDays(rawDays), fallbackCourts);
  const daysError = validatePlayDays(days, durationMinutes);
  if (daysError) {
    throw new Error(daysError);
  }
  if (days.some((day) => courtsForScheduleDay(day).length === 0)) {
    throw new Error("Agrega al menos una cancha en cada día.");
  }
  return {
    days,
    courts: courtsForScheduleDay(days[0]!),
  };
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
