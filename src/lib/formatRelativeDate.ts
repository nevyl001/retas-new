import {
  APP_TIMEZONE,
  diffCalendarDaysMexico,
  formatMatchDateShort,
} from "./matchDate";

/** Formato relativo para UI (es-MX, calendario México). */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = diffCalendarDaysMexico(date, now);

  if (diffMins < 1) return "Hace un momento";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24 && diffDays === 0) return `Hace ${diffHours} h`;
  if (diffDays === 1) return "Ayer";
  if (diffDays > 1 && diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays >= 7 && diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "Hace 1 semana" : `Hace ${weeks} semanas`;
  }

  const { year: dateYear } = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
  })
    .formatToParts(date)
    .reduce(
      (acc, part) => {
        if (part.type === "year") acc.year = Number(part.value);
        return acc;
      },
      { year: date.getFullYear() }
    );
  const nowYear = mexicoYear(now);

  return formatMatchDateShort(iso, {
    includeYear: dateYear !== nowYear,
  });
}

function mexicoYear(instant: Date): number {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
  })
    .formatToParts(instant)
    .find((p) => p.type === "year");
  return Number(part?.value ?? instant.getFullYear());
}
