import { APP_TIMEZONE } from "../matchDate";
import { programadoIsoFromMexicoCalendar } from "./teScheduleTime";
import type {
  TorneoExpressEstado,
  TorneoExpressEventoEstado,
} from "./types";

function parseInstantMs(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Inicio del día de calendario del evento (00:00) en zona México.
 * `fechaInicio` es YYYY-MM-DD (campo date del evento).
 */
export function eventFechaInicioStartMs(
  fechaInicio: string | null | undefined,
  _timezone?: string | null
): number | null {
  const date = fechaInicio?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // Producto: eventos TE usan America/Mexico_City (o equivalente).
  void _timezone;
  void APP_TIMEZONE;
  const iso = programadoIsoFromMexicoCalendar(date, "00:00");
  return parseInstantMs(iso);
}

/** Instantáneo a partir del cual ya “empezó” la competencia para badges. */
export function resolveCompetitionStartMs(input: {
  eventFechaInicio?: string | null;
  eventTimezone?: string | null;
  /** Primer `programado_en` de la categoría (más preciso si existe). */
  earliestProgramadoEn?: string | null;
}): number | null {
  const fromMatches = parseInstantMs(input.earliestProgramadoEn ?? null);
  if (fromMatches != null) return fromMatches;
  return eventFechaInicioStartMs(
    input.eventFechaInicio,
    input.eventTimezone
  );
}

export function hasCompetitionStarted(input: {
  eventFechaInicio?: string | null;
  eventTimezone?: string | null;
  earliestProgramadoEn?: string | null;
  now?: Date;
}): boolean {
  const startMs = resolveCompetitionStartMs(input);
  if (startMs == null) return true; // sin calendario: respetar estado guardado
  const nowMs = (input.now ?? new Date()).getTime();
  return nowMs >= startMs;
}

function asTorneoEstado(
  estado: TorneoExpressEstado | string | null | undefined
): TorneoExpressEstado {
  if (estado === "finalizado" || estado === "en_curso" || estado === "pendiente") {
    return estado;
  }
  return "pendiente";
}

/**
 * Estado para badges/UI: no mostrar «En curso» / live antes del día/hora
 * programados del evento o del primer partido.
 */
export function resolveTorneoExpressDisplayEstado(input: {
  estado: TorneoExpressEstado | string | null | undefined;
  eventFechaInicio?: string | null;
  eventTimezone?: string | null;
  earliestProgramadoEn?: string | null;
  now?: Date;
}): TorneoExpressEstado {
  const estado = asTorneoEstado(input.estado);
  if (estado === "finalizado") return "finalizado";
  if (estado !== "en_curso") return estado;

  if (
    !hasCompetitionStarted({
      eventFechaInicio: input.eventFechaInicio,
      eventTimezone: input.eventTimezone,
      earliestProgramadoEn: input.earliestProgramadoEn,
      now: input.now,
    })
  ) {
    return "pendiente";
  }
  return "en_curso";
}

/**
 * Estado de Evento para chips PUBLICADO / EN CURSO.
 * Antes de fecha_inicio nunca se muestra como en curso.
 */
export function resolveEventoDisplayEstado(input: {
  estado: TorneoExpressEventoEstado;
  fecha_inicio?: string | null;
  timezone?: string | null;
  now?: Date;
}): TorneoExpressEventoEstado {
  const { estado } = input;
  if (
    estado === "draft" ||
    estado === "archived" ||
    estado === "completed"
  ) {
    return estado;
  }

  if (
    !hasCompetitionStarted({
      eventFechaInicio: input.fecha_inicio,
      eventTimezone: input.timezone,
      now: input.now,
    })
  ) {
    return "published";
  }

  return estado;
}

export function earliestProgramadoEnFromPartidos(
  partidos: Array<{ programado_en?: string | null }>
): string | null {
  let best: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const partido of partidos) {
    const iso = partido.programado_en?.trim();
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}
