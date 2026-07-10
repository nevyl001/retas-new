import {
  APP_TIMEZONE,
  formatMatchDateWeekday,
  formatMatchTime,
  toMexicoCalendarDate,
} from "../matchDate";
import type { TorneoExpressPartido } from "./types";

/** ISO usado para mostrar/editar (programado_en o created_at). */
export function partidoScheduleIso(partido: TorneoExpressPartido): string {
  return partido.programado_en ?? partido.created_at;
}

export function formatPartidoFecha(iso: string): string {
  try {
    return formatMatchDateWeekday(iso);
  } catch {
    return "—";
  }
}

export function formatPartidoHora(iso: string): string {
  try {
    return formatMatchTime(iso);
  } catch {
    return "—";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Valor para `<input type="date">` en zona local (México). */
export function partidoDateInputValue(iso: string): string {
  return toMexicoCalendarDate(iso);
}

/** Valor para `<input type="time">` en zona local (México). */
export function partidoTimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "12:00";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${pad2(Number(hour))}:${pad2(Number(minute))}`;
}

export function combinePartidoDateAndTime(
  dateStr: string,
  timeStr: string
): string | null {
  const date = dateStr.trim();
  if (!date) return null;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const time = (timeStr.trim() || "12:00").match(/^(\d{1,2}):(\d{2})$/);
  const hh = time ? Math.min(23, Number(time[1])) : 12;
  const mm = time ? Math.min(59, Number(time[2])) : 0;
  const local = new Date(Number(y), Number(m) - 1, Number(d), hh, mm, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function programadoDraftFromPartido(
  partido: TorneoExpressPartido
): { date: string; time: string } {
  const iso = partidoScheduleIso(partido);
  return {
    date: partidoDateInputValue(iso),
    time: partidoTimeInputValue(iso),
  };
}

export function programadoIsoFromDraft(
  date: string,
  time: string
): string | null {
  return combinePartidoDateAndTime(date, time);
}
