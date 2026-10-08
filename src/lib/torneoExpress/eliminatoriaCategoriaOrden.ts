import { formatCanchaDisplay, normalizeCanchaForSave } from "./canchaDisplay";
import { formatTorneoExpressCategoria } from "./formatCategoria";
import { resolveEventoTimeZone } from "./eventoTemporal";
import type { TorneoExpressFaseEliminacion } from "./types";

export const ELIMINATORIA_CANCHAS_MAX = 16;

export const ELIMINATORIA_RONDA_MINUTES_MIN = 5;
export const ELIMINATORIA_RONDA_MINUTES_MAX = 240;
export const ELIMINATORIA_RONDA_DEFAULT_MINUTES = 60;

export type EliminatoriaRondaKey =
  | "octavos"
  | "cuartos"
  | "semifinal"
  | "final";

export type EliminatoriaDuraciones = Record<EliminatoriaRondaKey, number>;

export const ELIMINATORIA_RONDA_FIELDS: ReadonlyArray<{
  key: EliminatoriaRondaKey;
  label: string;
}> = [
  { key: "octavos", label: "Octavos" },
  { key: "cuartos", label: "Cuartos" },
  { key: "semifinal", label: "Semis" },
  { key: "final", label: "Final" },
];

export const DEFAULT_ELIMINATORIA_DURACIONES: EliminatoriaDuraciones = {
  octavos: ELIMINATORIA_RONDA_DEFAULT_MINUTES,
  cuartos: ELIMINATORIA_RONDA_DEFAULT_MINUTES,
  semifinal: ELIMINATORIA_RONDA_DEFAULT_MINUTES,
  final: ELIMINATORIA_RONDA_DEFAULT_MINUTES,
};

function clampRondaMinutes(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return ELIMINATORIA_RONDA_DEFAULT_MINUTES;
  return Math.min(
    ELIMINATORIA_RONDA_MINUTES_MAX,
    Math.max(ELIMINATORIA_RONDA_MINUTES_MIN, Math.round(parsed))
  );
}

export function normalizeEliminatoriaDuraciones(
  raw: unknown
): EliminatoriaDuraciones {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    octavos: clampRondaMinutes(
      obj.octavos ?? DEFAULT_ELIMINATORIA_DURACIONES.octavos
    ),
    cuartos: clampRondaMinutes(
      obj.cuartos ?? DEFAULT_ELIMINATORIA_DURACIONES.cuartos
    ),
    semifinal: clampRondaMinutes(
      obj.semifinal ?? DEFAULT_ELIMINATORIA_DURACIONES.semifinal
    ),
    final: clampRondaMinutes(
      obj.final ?? DEFAULT_ELIMINATORIA_DURACIONES.final
    ),
  };
}

export function sameEliminatoriaDuraciones(
  a: unknown,
  b: unknown
): boolean {
  const left = normalizeEliminatoriaDuraciones(a);
  const right = normalizeEliminatoriaDuraciones(b);
  return ELIMINATORIA_RONDA_FIELDS.every(
    ({ key }) => left[key] === right[key]
  );
}

/** Minutos de cuadro para una categoría, según su fase y los tiempos del evento. */
export function categoriaKnockoutMinutes(
  fase: TorneoExpressFaseEliminacion | null | undefined,
  duraciones?: unknown
): number {
  const d = normalizeEliminatoriaDuraciones(duraciones);
  if (fase === "semifinal") return d.semifinal + d.final;
  if (fase === "octavos") {
    return d.octavos + d.cuartos + d.semifinal + d.final;
  }
  return d.cuartos + d.semifinal + d.final;
}

const FUERZA_RANK: ReadonlyArray<{ needle: string; rank: number }> = [
  { needle: "8ta", rank: 100 },
  { needle: "8va", rank: 100 },
  { needle: "7ta", rank: 110 },
  { needle: "7ma", rank: 110 },
  { needle: "6ta", rank: 120 },
  { needle: "5ta", rank: 130 },
  { needle: "4ta", rank: 140 },
  { needle: "3ta", rank: 150 },
  { needle: "3ra", rank: 150 },
  { needle: "2da", rank: 160 },
  { needle: "1ra", rank: 170 },
];

function foldLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Nivel para ordenar arranque de eliminatoria: más baja primero.
 * Mixtos D → … → 6ta → 5ta → 4ta.
 */
export function categoriaNivelRank(label: string): number {
  const n = foldLabel(label);
  const mix = n.match(/mixtos?\s*([a-f])/i);
  if (mix) {
    const letter = mix[1].toUpperCase().charCodeAt(0);
    // D más baja (10) → A más alta entre mixtos (40), siempre antes de 8ta (100).
    return 10 + ("D".charCodeAt(0) - letter) * 10;
  }
  for (const { needle, rank } of FUERZA_RANK) {
    if (n.includes(needle)) return rank;
  }
  return 400;
}

export type CategoriaOrdenable = {
  id: string;
  nombre: string;
  categoria?: string | null;
  fase_eliminacion?: TorneoExpressFaseEliminacion | null;
};

export function categoriaOrdenLabel(cat: CategoriaOrdenable): string {
  return formatTorneoExpressCategoria(cat.categoria) || cat.nombre;
}

export function orderCategoriasForEliminatoria<T extends CategoriaOrdenable>(
  categorias: readonly T[],
  savedIds?: readonly string[] | null
): T[] {
  const byId = new Map(categorias.map((cat) => [cat.id, cat]));
  const used = new Set<string>();
  const out: T[] = [];
  for (const id of savedIds ?? []) {
    const cat = byId.get(id);
    if (!cat || used.has(id)) continue;
    out.push(cat);
    used.add(id);
  }
  const rest = categorias
    .filter((cat) => !used.has(cat.id))
    .slice()
    .sort((a, b) => {
      const ra = categoriaNivelRank(categoriaOrdenLabel(a));
      const rb = categoriaNivelRank(categoriaOrdenLabel(b));
      if (ra !== rb) return ra - rb;
      return categoriaOrdenLabel(a).localeCompare(categoriaOrdenLabel(b), "es");
    });
  return [...out, ...rest];
}

export type EliminatoriaPossibleSlot = {
  torneoId: string;
  label: string;
  startsAt: Date | null;
  href: string;
  courts: string[];
};

export function normalizeEliminatoriaCanchas(
  raw: readonly string[] | null | undefined
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw ?? []) {
    const value = normalizeCanchaForSave(String(item ?? ""));
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= ELIMINATORIA_CANCHAS_MAX) break;
  }
  return out;
}

export function formatEliminatoriaCourtsLabel(
  courts: readonly string[]
): string | null {
  const labels = courts.map((court) => formatCanchaDisplay(court));
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return labels.join(", ");
}

export function buildEliminatoriaPossibleSchedule(
  categorias: readonly CategoriaOrdenable[],
  savedIds: readonly string[] | null | undefined,
  startIso: string | null | undefined,
  canchas?: readonly string[] | null,
  duraciones?: unknown
): EliminatoriaPossibleSlot[] {
  const ordered = orderCategoriasForEliminatoria(categorias, savedIds);
  const courts = normalizeEliminatoriaCanchas(canchas);
  const startMs = startIso ? new Date(startIso).getTime() : NaN;
  const hasStart = Number.isFinite(startMs);
  let offsetMs = 0;
  return ordered.map((cat) => {
    const slot: EliminatoriaPossibleSlot = {
      torneoId: cat.id,
      label: categoriaOrdenLabel(cat),
      startsAt: hasStart ? new Date(startMs + offsetMs) : null,
      href: `/torneo-express/${cat.id}/eliminatoria`,
      courts,
    };
    offsetMs +=
      categoriaKnockoutMinutes(cat.fase_eliminacion, duraciones) * 60 * 1000;
    return slot;
  });
}

export function formatEliminatoriaSlotTime(
  startsAt: Date | null,
  timeZone?: string | null
): string {
  if (!startsAt) return "Por definir";
  try {
    return startsAt.toLocaleString("es-MX", {
      timeZone: resolveEventoTimeZone(timeZone),
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Por definir";
  }
}
