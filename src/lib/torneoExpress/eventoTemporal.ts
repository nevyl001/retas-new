import type { TorneoExpressEventoEstado } from "./types";

/**
 * Estado temporal de un Evento para la lista (filtros y resumen).
 *
 * No es el estado de publicación: `published` / `draft` dicen si el evento
 * está publicado; esto dice dónde está en el tiempo. La clasificación usa
 * la zona horaria del propio evento.
 *
 * Reglas (en este orden):
 * - `draft`                   → borrador
 * - `completed` | `archived`  → finalizado (estado real, nunca por fecha)
 * - ahora < inicio del día `fecha_inicio` (en su zona) → próximo
 * - `in_progress`             → en curso
 * - `published` con `fecha_inicio` ya iniciada → en curso
 * - `published` sin `fecha_inicio` → próximo (aún no hay nada que indique inicio)
 *
 * Un evento cuya `fecha_fin` ya pasó pero que no está marcado como finalizado
 * sigue «en curso»: cerrar un evento es una decisión de estado, no de calendario.
 */
export type EventoTemporalEstado =
  | "borrador"
  | "en_curso"
  | "proximo"
  | "finalizado";

export type EventoTemporalInput = {
  estado: TorneoExpressEventoEstado;
  fecha_inicio: string | null;
  timezone?: string | null;
};

export const EVENTO_TEMPORAL_FALLBACK_TZ = "America/Mexico_City";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function offsetMsAt(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveEventoTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  return tz && isValidTimeZone(tz) ? tz : EVENTO_TEMPORAL_FALLBACK_TZ;
}

/** Instante (ms UTC) en que empieza el día `YYYY-MM-DD` en la zona dada. */
export function zonedDayStartMs(
  date: string | null | undefined,
  timeZone?: string | null
): number | null {
  const day = date?.trim();
  if (!day || !DATE_RE.test(day)) return null;
  const tz = resolveEventoTimeZone(timeZone);
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let result = guess - offsetMsAt(guess, tz);
  // Segunda pasada: corrige cuando el offset cambia entre la estimación y el resultado (DST).
  const second = guess - offsetMsAt(result, tz);
  if (second !== result) result = second;
  return Number.isFinite(result) ? result : null;
}

export function classifyEventoTemporal(
  evento: EventoTemporalInput,
  now: Date = new Date()
): EventoTemporalEstado {
  const { estado } = evento;
  if (estado === "draft") return "borrador";
  if (estado === "completed" || estado === "archived") return "finalizado";

  const startMs = zonedDayStartMs(evento.fecha_inicio, evento.timezone);
  if (startMs != null && now.getTime() < startMs) return "proximo";
  if (estado === "in_progress") return "en_curso";
  return startMs != null ? "en_curso" : "proximo";
}

export const EVENTO_TEMPORAL_LABEL: Record<EventoTemporalEstado, string> = {
  borrador: "Borrador",
  en_curso: "En curso",
  proximo: "Próximo",
  finalizado: "Finalizado",
};

export type EventoFiltro = "todos" | EventoTemporalEstado;

export const EVENTO_FILTROS: ReadonlyArray<{ id: EventoFiltro; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "en_curso", label: "En curso" },
  { id: "proximo", label: "Próximos" },
  { id: "borrador", label: "Borradores" },
  { id: "finalizado", label: "Finalizados" },
];

/** Orden de la vista «Todos»: lo que requiere atención primero. */
const RANK: Record<EventoTemporalEstado, number> = {
  en_curso: 0,
  proximo: 1,
  borrador: 2,
  finalizado: 3,
};

export type EventoResumen = Record<EventoTemporalEstado, number> & {
  total: number;
};

export function summarizeEventos(
  eventos: ReadonlyArray<EventoTemporalInput>,
  now: Date = new Date()
): EventoResumen {
  const out: EventoResumen = {
    total: 0,
    borrador: 0,
    en_curso: 0,
    proximo: 0,
    finalizado: 0,
  };
  for (const ev of eventos) {
    out[classifyEventoTemporal(ev, now)] += 1;
    out.total += 1;
  }
  return out;
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Filtra y ordena (estable) sin tocar la lista original. */
export function filterEventos<T extends EventoTemporalInput & { nombre: string }>(
  eventos: ReadonlyArray<T>,
  opts: { filtro: EventoFiltro; query: string; now?: Date }
): T[] {
  const now = opts.now ?? new Date();
  const q = normalizeSearch(opts.query);
  const tagged = eventos
    .map((ev, index) => ({ ev, index, temporal: classifyEventoTemporal(ev, now) }))
    .filter(({ ev, temporal }) => {
      if (opts.filtro !== "todos" && temporal !== opts.filtro) return false;
      return !q || normalizeSearch(ev.nombre).includes(q);
    });
  if (opts.filtro === "todos") {
    tagged.sort((a, b) => RANK[a.temporal] - RANK[b.temporal] || a.index - b.index);
  }
  return tagged.map(({ ev }) => ev);
}
