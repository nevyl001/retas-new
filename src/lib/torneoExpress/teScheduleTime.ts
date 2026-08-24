import { APP_TIMEZONE } from "../matchDate";
import { partidoDateInputValue } from "./partidoSchedule";

export type MexicoCalendarDateTime = {
  date: string;
  time: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseCalendarDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

function parseTimeInput(timeStr: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((timeStr.trim() || "09:00"));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

function mexicoDateTimeParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? "0";
    return Number(raw);
  };

  const hour = read("hour") % 24;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
  };
}

/** Convierte fecha/hora de calendario México → ISO UTC. */
export function programadoIsoFromMexicoCalendar(
  dateStr: string,
  timeStr: string
): string | null {
  const dateParts = parseCalendarDate(dateStr);
  const timeParts = parseTimeInput(timeStr);
  if (!dateParts || !timeParts) return null;

  const { year, month, day } = dateParts;
  const { hour, minute } = timeParts;

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 8; attempt++) {
    const actual = mexicoDateTimeParts(new Date(utcMs));
    const desiredUtcDay = Date.UTC(year, month - 1, day);
    const actualUtcDay = Date.UTC(actual.year, actual.month - 1, actual.day);
    const dayDiff = Math.round((desiredUtcDay - actualUtcDay) / 86_400_000);
    const minuteDiff =
      dayDiff * 24 * 60 +
      (hour - actual.hour) * 60 +
      (minute - actual.minute);

    if (minuteDiff === 0) {
      return new Date(utcMs).toISOString();
    }
    utcMs += minuteDiff * 60_000;
  }

  return null;
}

/** Suma minutos a un instante ISO; devuelve fecha/hora calendario México. */
export function addMinutesToMexicoCalendar(
  dateStr: string,
  timeStr: string,
  minutes: number
): MexicoCalendarDateTime | null {
  const iso = programadoIsoFromMexicoCalendar(dateStr, timeStr);
  if (!iso || !Number.isFinite(minutes) || minutes < 0) return null;

  const nextMs = new Date(iso).getTime() + Math.floor(minutes) * 60_000;
  const nextIso = new Date(nextMs).toISOString();

  return {
    date: partidoDateInputValue(nextIso),
    time: partidoTimeInputValue24(nextIso),
  };
}

/** Hora 24h en México desde ISO (para slots internos y tests). */
export function partidoTimeInputValue24(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00:00";
  const parts = mexicoDateTimeParts(d);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** Fecha de hoy en calendario México (YYYY-MM-DD). */
export function todayMexicoDateInput(): string {
  return partidoDateInputValue(new Date().toISOString());
}

/** Clave estable de slot (fecha + hora México). */
export function mexicoScheduleSlotKey(iso: string): string {
  return `${partidoDateInputValue(iso)}T${partidoTimeInputValue24(iso)}`;
}
