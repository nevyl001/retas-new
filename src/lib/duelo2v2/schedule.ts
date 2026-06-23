import {
  combinePartidoDateAndTime,
  formatPartidoHora,
  partidoDateInputValue,
  partidoTimeInputValue,
} from "../torneoExpress/partidoSchedule";
import { canchaDraftFromStored } from "../torneoExpress/canchaDisplay";
import type { Duelo2v2 } from "./types";

/** Rango horario legible: "3:00 – 5:00 p.m." o "3:00 p.m. – 5:00 a.m." */
export function formatDueloHorarioRange(
  inicioIso: string | null | undefined,
  finIso: string | null | undefined
): string | null {
  if (!inicioIso?.trim()) return null;
  if (!finIso?.trim()) return formatPartidoHora(inicioIso);

  const inicioDate = new Date(inicioIso);
  const finDate = new Date(finIso);
  if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
    return formatPartidoHora(inicioIso);
  }

  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const inicioFull = inicioDate.toLocaleTimeString("es-MX", timeOpts);
  const finFull = finDate.toLocaleTimeString("es-MX", timeOpts);
  const meridiemRe = /\s*(a\.?\s*m\.?|p\.?\s*m\.?)\s*$/i;

  const inicioMer = inicioFull.match(meridiemRe)?.[1] ?? "";
  const finMer = finFull.match(meridiemRe)?.[1] ?? "";
  const inicioTime = inicioFull.replace(meridiemRe, "").trim();
  const finTime = finFull.replace(meridiemRe, "").trim();

  if (
    inicioMer &&
    finMer &&
    inicioMer.replace(/\./g, "").toLowerCase() ===
      finMer.replace(/\./g, "").toLowerCase()
  ) {
    return `${inicioTime} – ${finTime} ${finMer}`;
  }

  return `${inicioFull} – ${finFull}`;
}

export function dueloScheduleDraftFromDuelo(
  duelo: Pick<Duelo2v2, "programado_en" | "programado_hasta" | "created_at">
): { date: string; timeStart: string; timeEnd: string } {
  const base = duelo.programado_en?.trim() || duelo.created_at;
  const endBase =
    duelo.programado_hasta?.trim() ||
    duelo.programado_en?.trim() ||
    duelo.created_at;
  return {
    date: partidoDateInputValue(base),
    timeStart: partidoTimeInputValue(base),
    timeEnd: partidoTimeInputValue(endBase),
  };
}

export function resolveDueloScheduleFromDraft(
  date: string,
  timeStart: string,
  timeEnd: string
):
  | { programado_en: string; programado_hasta: string }
  | { error: string } {
  const programadoEn = combinePartidoDateAndTime(date, timeStart);
  const programadoHasta = combinePartidoDateAndTime(date, timeEnd);
  if (!programadoEn || !programadoHasta) {
    return { error: "Revisa la fecha y las horas del encuentro" };
  }
  if (new Date(programadoHasta).getTime() <= new Date(programadoEn).getTime()) {
    return { error: "La hora de fin debe ser posterior a la de inicio" };
  }
  return { programado_en: programadoEn, programado_hasta: programadoHasta };
}

export function dueloCanchaDraftFromDuelo(
  duelo: Pick<Duelo2v2, "cancha">
): string {
  return canchaDraftFromStored(duelo.cancha);
}
