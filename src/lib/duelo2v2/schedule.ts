import {
  combinePartidoDateAndTime,
  formatPartidoHora,
  partidoDateInputValue,
  partidoTimeInputValue,
} from "../torneoExpress/partidoSchedule";
import { canchaDraftFromStored } from "../torneoExpress/canchaDisplay";
import type { Duelo2v2 } from "./types";

/** Rango horario legible: "3:00 p.m. a 5:00 p.m." */
export function formatDueloHorarioRange(
  inicioIso: string | null | undefined,
  finIso: string | null | undefined
): string | null {
  if (!inicioIso?.trim()) return null;
  const inicio = formatPartidoHora(inicioIso);
  if (!finIso?.trim()) return inicio;
  const fin = formatPartidoHora(finIso);
  return `${inicio} a ${fin}`;
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
