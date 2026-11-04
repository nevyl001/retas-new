/**
 * Estado público de jornada/partido sincronizado con fecha + hora programada.
 *
 * El estado en BD (`in_progress`) puede activarse al iniciar/regenerar la
 * jornada antes del horario publicado. En pantallas públicas, "En juego" /
 * "En curso" solo se muestran cuando ese horario ya llegó (o no hay horario).
 *
 * `completed` siempre manda. No altera administración ni escrituras en BD.
 */

import {
  EVENTO_TEMPORAL_FALLBACK_TZ,
  zonedDateTimeMs,
  zonedDayStartMs,
} from "../torneoExpress/eventoTemporal";
import { dateInputValue, jornadaHoraInicioLabel, timeInputValue } from "./programacion";
import type {
  LigaJornada,
  LigaJornadaEstado,
  LigaPartido,
  LigaPartidoEstado,
} from "./types";

export const LIGA_TEMPORAL_TZ = EVENTO_TEMPORAL_FALLBACK_TZ;

export type LigaTemporalContext = {
  fechaJornada?: string | null;
  /** Hora de referencia de la jornada (ronda 1), HH:mm o HH:mm:ss. */
  horaJornada?: string | null;
  now?: Date;
  timeZone?: string | null;
};

/** Instante de inicio (ms UTC) de fecha + hora en zona México (default). */
export function resolveLigaProgramadoStartMs(
  fecha: string | null | undefined,
  horaInicio: string | null | undefined,
  timeZone: string | null | undefined = LIGA_TEMPORAL_TZ
): number | null {
  const day = dateInputValue(fecha);
  if (!day) return null;
  const hora = timeInputValue(horaInicio);
  if (hora) {
    return zonedDateTimeMs(`${day}T${hora}`, timeZone);
  }
  return zonedDayStartMs(day, timeZone);
}

function startHasNotArrived(
  startMs: number | null,
  now: Date
): boolean {
  return startMs != null && now.getTime() < startMs;
}

/**
 * Estado visible en público para un partido.
 * Si BD dice in_progress pero el horario aún no llega → upcoming (Pendiente).
 */
export function partidoPublicTemporalEstado(
  partido: Pick<LigaPartido, "estado" | "hora_inicio" | "ronda">,
  ctx: LigaTemporalContext = {}
): LigaPartidoEstado {
  if (partido.estado === "completed") return "completed";
  if (partido.estado !== "in_progress") return "upcoming";

  const now = ctx.now ?? new Date();
  const hora =
    timeInputValue(partido.hora_inicio) ||
    timeInputValue(ctx.horaJornada) ||
    null;
  const startMs = resolveLigaProgramadoStartMs(
    ctx.fechaJornada,
    hora,
    ctx.timeZone ?? LIGA_TEMPORAL_TZ
  );
  if (startHasNotArrived(startMs, now)) return "upcoming";
  return "in_progress";
}

/**
 * Estado visible en público para una jornada.
 * Usa hora de ronda 1 (o la primera disponible) + fecha de la jornada.
 */
export function jornadaPublicTemporalEstado(
  jornada: Pick<LigaJornada, "estado" | "fecha" | "partidos">,
  ctx: Omit<LigaTemporalContext, "fechaJornada" | "horaJornada"> = {}
): LigaJornadaEstado {
  if (jornada.estado === "completed") return "completed";
  if (jornada.estado !== "in_progress") return "upcoming";

  const now = ctx.now ?? new Date();
  const hora =
    jornadaHoraInicioLabel(jornada.partidos ?? []) ??
    null;
  const startMs = resolveLigaProgramadoStartMs(
    jornada.fecha,
    hora,
    ctx.timeZone ?? LIGA_TEMPORAL_TZ
  );
  if (startHasNotArrived(startMs, now)) return "upcoming";
  return "in_progress";
}

/** Estado de una ronda a partir de estados temporales de sus partidos. */
export function rondaPublicTemporalEstado(
  partidos: Array<Pick<LigaPartido, "estado" | "hora_inicio" | "ronda">>,
  ctx: LigaTemporalContext
): "pending" | "live" | "done" {
  if (partidos.length === 0) return "pending";
  const estados = partidos.map((p) => partidoPublicTemporalEstado(p, ctx));
  if (estados.every((e) => e === "completed")) return "done";
  if (estados.some((e) => e === "in_progress")) return "live";
  return "pending";
}

export type PublicRondaEstadoItem = {
  ronda: number;
  estado: "pending" | "live" | "done";
};

/**
 * Ronda a mostrar por defecto en la vista pública:
 * 1) primera en curso, 2) primera pendiente, 3) última completada / disponible.
 */
export function pickDefaultPublicRonda(
  rondas: ReadonlyArray<PublicRondaEstadoItem>
): number | null {
  if (rondas.length === 0) return null;
  const sorted = [...rondas].sort((a, b) => a.ronda - b.ronda);
  const live = sorted.find((r) => r.estado === "live");
  if (live) return live.ronda;
  const pending = sorted.find((r) => r.estado === "pending");
  if (pending) return pending.ronda;
  return sorted[sorted.length - 1]!.ronda;
}

export type PublicJornadaEstadoItem = {
  id: string;
  numero: number;
  estado: "upcoming" | "in_progress" | "completed";
};

/**
 * Jornada a mostrar por defecto en el programa público:
 * 1) en curso, 2) primera próxima, 3) última completada.
 * Si la jornada actual ya terminó, avanza a la siguiente pendiente.
 */
export function pickDefaultPublicJornadaId(
  jornadas: ReadonlyArray<PublicJornadaEstadoItem>
): string | null {
  if (jornadas.length === 0) return null;
  const sorted = [...jornadas].sort((a, b) => a.numero - b.numero);
  const live = sorted.find((j) => j.estado === "in_progress");
  if (live) return live.id;
  const upcoming = sorted.find((j) => j.estado === "upcoming");
  if (upcoming) return upcoming.id;
  return sorted[sorted.length - 1]!.id;
}
