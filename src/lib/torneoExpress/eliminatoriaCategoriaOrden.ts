import { formatTorneoExpressCategoria } from "./formatCategoria";
import { resolveEventoTimeZone } from "./eventoTemporal";

export const ELIMINATORIA_CATEGORIA_GAP_MINUTES = 60;

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
};

export function buildEliminatoriaPossibleSchedule(
  categorias: readonly CategoriaOrdenable[],
  savedIds: readonly string[] | null | undefined,
  startIso: string | null | undefined
): EliminatoriaPossibleSlot[] {
  const ordered = orderCategoriasForEliminatoria(categorias, savedIds);
  const startMs = startIso ? new Date(startIso).getTime() : NaN;
  const hasStart = Number.isFinite(startMs);
  const gapMs = ELIMINATORIA_CATEGORIA_GAP_MINUTES * 60 * 1000;
  return ordered.map((cat, index) => ({
    torneoId: cat.id,
    label: categoriaOrdenLabel(cat),
    startsAt: hasStart ? new Date(startMs + index * gapMs) : null,
    href: `/torneo-express/${cat.id}/eliminatoria`,
  }));
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
