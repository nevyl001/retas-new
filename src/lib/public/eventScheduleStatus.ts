import { formatDueloHorarioRange } from "../duelo2v2/schedule";
import { formatPartidoFecha } from "../torneoExpress/partidoSchedule";

export type EventSchedulePhase = "upcoming" | "in_window" | "after" | "unknown";

export type PublicEventStatusTone = "pending" | "live" | "gold";

export type PublicEventScheduleStatus = {
  label: "Por comenzar" | "En vivo" | "Finalizada";
  tone: PublicEventStatusTone;
  phase: EventSchedulePhase;
};

export type EventScheduleFields = {
  programado_en?: string | null;
  programado_hasta?: string | null;
  is_finished?: boolean | null;
};

export function resolveEventSchedulePhase(
  schedule: Pick<EventScheduleFields, "programado_en" | "programado_hasta">,
  now: Date = new Date()
): EventSchedulePhase {
  const startMs = schedule.programado_en
    ? new Date(schedule.programado_en).getTime()
    : NaN;
  const endMs = schedule.programado_hasta
    ? new Date(schedule.programado_hasta).getTime()
    : NaN;
  const t = now.getTime();

  if (!Number.isFinite(startMs)) return "unknown";
  if (t < startMs) return "upcoming";
  if (Number.isFinite(endMs) && t > endMs) return "after";
  return "in_window";
}

/**
 * Estado público por ventana de horario (día/hora + duración → programado_hasta).
 * Si el evento ya está marcado finalizado, siempre "Finalizada".
 * Sin horario guardado: En vivo (salvo finalizado).
 */
export function getPublicEventScheduleStatus(
  schedule: EventScheduleFields,
  now: Date = new Date()
): PublicEventScheduleStatus {
  if (schedule.is_finished) {
    return { label: "Finalizada", tone: "gold", phase: "after" };
  }

  const phase = resolveEventSchedulePhase(schedule, now);
  if (phase === "upcoming") {
    return { label: "Por comenzar", tone: "pending", phase };
  }
  if (phase === "after") {
    return { label: "Finalizada", tone: "gold", phase };
  }
  if (phase === "in_window") {
    return { label: "En vivo", tone: "live", phase };
  }

  return { label: "En vivo", tone: "live", phase: "unknown" };
}

export function formatPublicEventFecha(
  programado_en: string | null | undefined
): string | null {
  const iso = programado_en?.trim();
  if (!iso) return null;
  const label = formatPartidoFecha(iso);
  return label === "—" ? null : label;
}

export function formatPublicEventHorario(
  programado_en: string | null | undefined,
  programado_hasta: string | null | undefined
): string | null {
  return formatDueloHorarioRange(programado_en, programado_hasta);
}

/** Línea de hero: "vie 1 ago 2026 · 3:00 – 5:00 p.m." */
export function formatPublicEventFechaHorarioLine(
  programado_en: string | null | undefined,
  programado_hasta: string | null | undefined
): string | null {
  const fecha = formatPublicEventFecha(programado_en);
  const horario = formatPublicEventHorario(programado_en, programado_hasta);
  if (fecha && horario) return `${fecha} · ${horario}`;
  return fecha || horario;
}

export function resolvePublicEventLugar(fields: {
  lugar?: string | null;
  mostrar_lugar?: boolean | null;
}): string | null {
  if (fields.mostrar_lugar === false) return null;
  const lugar = fields.lugar?.trim();
  return lugar || null;
}

/** Badge de partido según ventana del evento + resultado del match. */
export function resolvePublicMatchStatusVariant(opts: {
  matchFinished: boolean;
  eventPhase: EventSchedulePhase;
}): "finished" | "live" | "upcoming" | "pending" {
  if (opts.matchFinished) return "finished";
  if (opts.eventPhase === "upcoming") return "upcoming";
  if (opts.eventPhase === "in_window" || opts.eventPhase === "unknown") {
    return "live";
  }
  // after window, match still open → pending (sin “en vivo”)
  return "pending";
}
