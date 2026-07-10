import { parsePartidosDetalle } from "./shared/buildPartidosDetalle";

/** Zona horaria canónica para fechas de partidos/retas en Riviera. */
export const APP_TIMEZONE = "America/Mexico_City";

export type ParticipacionFechaResolutionSource =
  | "metadata_evento_en"
  | "metadata_programado_en"
  | "fecha_iso"
  | "partidos_detalle"
  | "created_at"
  | "legacy_utc_midnight_fallback";

export interface ParticipacionFechaResolution {
  instant: string;
  source: ParticipacionFechaResolutionSource;
  isLegacyDateOnly: boolean;
}

const MONTH_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function parseInstant(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD del calendario en México para un instante ISO. */
export function toMexicoCalendarDate(iso: string): string {
  const d = parseInstant(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

export function mexicoDateParts(
  instant: Date
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function diffCalendarDaysMexico(a: Date, b: Date): number {
  const pa = mexicoDateParts(a);
  const pb = mexicoDateParts(b);
  const utcA = Date.UTC(pa.year, pa.month - 1, pa.day);
  const utcB = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((utcB - utcA) / 86_400_000);
}

function formatWithTimezone(
  iso: string,
  options: Intl.DateTimeFormatOptions
): string {
  const d = parseInstant(iso);
  if (!d) return "—";
  return d.toLocaleString("es-MX", { timeZone: APP_TIMEZONE, ...options });
}

/** "Jueves 9" */
export function formatMatchDateWeekday(iso: string): string {
  const wd = formatWithTimezone(iso, { weekday: "long" });
  const day = formatWithTimezone(iso, { day: "numeric" });
  if (wd === "—") return wd;
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${day}`;
}

/** "9 jul 2026" desde YYYY-MM-DD de calendario local (sin conversión TZ). */
export function formatMatchDateShortFromCalendar(yyyyMmDd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!match) return yyyyMmDd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLabel = MONTH_SHORT_ES[month - 1] ?? String(month);
  return `${day} ${monthLabel} ${year}`;
}

/** "9 jul 2026" */
export function formatMatchDateShort(
  iso: string,
  opts?: { includeYear?: boolean }
): string {
  const d = parseInstant(iso);
  if (!d) return iso;

  const { year, month, day } = mexicoDateParts(d);
  const monthLabel = MONTH_SHORT_ES[month - 1] ?? String(month);
  const includeYear = opts?.includeYear ?? true;
  if (!includeYear) return `${day} ${monthLabel}`;
  return `${day} ${monthLabel} ${year}`;
}

/** "6:00 p.m." */
export function formatMatchTime(iso: string): string {
  return formatWithTimezone(iso, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Instante ISO para mostrar/ordenar la fecha de una participación. */
export function resolveParticipacionFechaInstant(row: {
  fecha: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
}): string {
  return classifyParticipacionFechaResolution(row).instant;
}

function hasMetadataInstant(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.includes("T") ? v : null;
}

function isLegacyDateOnlyFecha(
  fecha: string,
  meta: Record<string, unknown>
): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
    !hasMetadataInstant(meta, "evento_en") &&
    !hasMetadataInstant(meta, "programado_en")
  );
}

/** Último instante ISO en partidos_detalle con hora real. */
export function resolveInstantFromPartidosDetalle(
  metadata?: Record<string, unknown> | null
): string | null {
  const detalle = parsePartidosDetalle(metadata?.partidos_detalle);
  const timestamps = detalle
    .map((partido) => partido.fecha?.trim())
    .filter((value): value is string => {
      if (!value || !value.includes("T")) return false;
      return parseInstant(value) != null;
    });
  if (timestamps.length === 0) return null;
  return latestIsoTimestamp(...timestamps);
}

/**
 * Desempate legacy con created_at cuando fecha es YYYY-MM-DD (slice UTC).
 * Si el día UTC de created_at coincide con fecha guardada, created_at trae la hora real.
 * Si no, elige entre medianoche UTC de fecha y created_at según el día calendario México.
 */
export function resolveLegacyInstantFromCreatedAt(
  fechaLegacy: string,
  createdAt?: string
): string | null {
  if (!createdAt?.includes("T")) return null;
  const created = parseInstant(createdAt);
  if (!created) return null;

  const createdUtcDay = createdAt.slice(0, 10);
  if (createdUtcDay === fechaLegacy) {
    return created.toISOString();
  }

  const createdMexico = toMexicoCalendarDate(createdAt);
  const utcMidnightMexico = toMexicoCalendarDate(`${fechaLegacy}T00:00:00.000Z`);

  if (utcMidnightMexico === createdMexico) {
    return `${fechaLegacy}T00:00:00.000Z`;
  }

  if (fechaLegacy === createdMexico) {
    return created.toISOString();
  }

  return created.toISOString();
}

export function classifyParticipacionFechaResolution(row: {
  fecha: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
}): ParticipacionFechaResolution {
  const meta = row.metadata ?? {};
  const eventoEn = hasMetadataInstant(meta, "evento_en");
  if (eventoEn) {
    return {
      instant: eventoEn,
      source: "metadata_evento_en",
      isLegacyDateOnly: false,
    };
  }

  const programadoEn = hasMetadataInstant(meta, "programado_en");
  if (programadoEn) {
    return {
      instant: programadoEn,
      source: "metadata_programado_en",
      isLegacyDateOnly: false,
    };
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(row.fecha)) {
    return {
      instant: row.fecha,
      source: "fecha_iso",
      isLegacyDateOnly: false,
    };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) {
    const isLegacy = isLegacyDateOnlyFecha(row.fecha, meta);
    const fromDetalle = resolveInstantFromPartidosDetalle(meta);
    if (fromDetalle) {
      return {
        instant: fromDetalle,
        source: "partidos_detalle",
        isLegacyDateOnly: isLegacy,
      };
    }

    const fromCreated = resolveLegacyInstantFromCreatedAt(row.fecha, row.created_at);
    if (fromCreated) {
      return {
        instant: fromCreated,
        source: "created_at",
        isLegacyDateOnly: isLegacy,
      };
    }

    return {
      instant: `${row.fecha}T00:00:00.000Z`,
      source: "legacy_utc_midnight_fallback",
      isLegacyDateOnly: isLegacy,
    };
  }

  const fallback = row.created_at ?? row.fecha;
  return {
    instant: fallback,
    source: row.created_at?.includes("T") ? "created_at" : "legacy_utc_midnight_fallback",
    isLegacyDateOnly: false,
  };
}

/** Campos de fecha al registrar participaciones nuevas. */
export function buildParticipacionFechaFields(eventoEn: string): {
  fecha: string;
  evento_en: string;
} {
  const instant = parseInstant(eventoEn);
  const iso = instant ? instant.toISOString() : new Date().toISOString();
  return {
    fecha: toMexicoCalendarDate(iso),
    evento_en: iso,
  };
}

/** Último instante entre varios ISO (ignora vacíos). */
export function latestIsoTimestamp(...candidates: Array<string | null | undefined>): string {
  let best = "";
  let bestMs = -Infinity;
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = value;
  }
  return best || new Date().toISOString();
}

export interface LegacyParticipacionFechaAuditSummary {
  totalLegacy: number;
  bySource: Record<ParticipacionFechaResolutionSource, number>;
  resolvedWithSignal: number;
  fallbackUtcMidnight: number;
}

/** Agrupa resoluciones para auditoría de registros legacy (fecha YYYY-MM-DD sin evento_en). */
export function summarizeLegacyParticipacionFechaResolutions(
  rows: Array<{
    fecha: string;
    created_at?: string;
    metadata?: Record<string, unknown> | null;
  }>
): LegacyParticipacionFechaAuditSummary {
  const bySource: Record<ParticipacionFechaResolutionSource, number> = {
    metadata_evento_en: 0,
    metadata_programado_en: 0,
    fecha_iso: 0,
    partidos_detalle: 0,
    created_at: 0,
    legacy_utc_midnight_fallback: 0,
  };

  let totalLegacy = 0;
  let resolvedWithSignal = 0;
  let fallbackUtcMidnight = 0;

  for (const row of rows) {
    const resolution = classifyParticipacionFechaResolution(row);
    if (!resolution.isLegacyDateOnly) continue;

    totalLegacy += 1;
    bySource[resolution.source] += 1;

    if (resolution.source === "legacy_utc_midnight_fallback") {
      fallbackUtcMidnight += 1;
    } else {
      resolvedWithSignal += 1;
    }
  }

  return {
    totalLegacy,
    bySource,
    resolvedWithSignal,
    fallbackUtcMidnight,
  };
}
