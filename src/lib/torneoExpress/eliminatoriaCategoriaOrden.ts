import { BRACKET_FASE_SLOTS } from "./bracketTypes";
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
  hint: string;
  required: boolean;
}> = [
  { key: "octavos", label: "Octavos", hint: "16 parejas", required: false },
  { key: "cuartos", label: "Cuartos", hint: "8 parejas", required: false },
  { key: "semifinal", label: "Semis", hint: "4 parejas", required: true },
  { key: "final", label: "Final", hint: "2 parejas", required: true },
];

export const DEFAULT_ELIMINATORIA_RONDAS_ACTIVAS: readonly EliminatoriaRondaKey[] =
  ["cuartos", "semifinal", "final"];

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

export function parseEliminatoriaRondasActivas(
  raw: unknown
): EliminatoriaRondaKey[] {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const allowed = new Set(
    ELIMINATORIA_RONDA_FIELDS.map((field) => field.key)
  );
  const listed = Array.isArray(obj.activas)
    ? obj.activas
        .map((item) => String(item))
        .filter((key): key is EliminatoriaRondaKey =>
          allowed.has(key as EliminatoriaRondaKey)
        )
    : null;
  const picked = new Set(
    listed ?? DEFAULT_ELIMINATORIA_RONDAS_ACTIVAS
  );
  for (const field of ELIMINATORIA_RONDA_FIELDS) {
    if (field.required) picked.add(field.key);
  }
  return ELIMINATORIA_RONDA_FIELDS.map((field) => field.key).filter((key) =>
    picked.has(key)
  );
}

export function toggleEliminatoriaRonda(
  activas: readonly EliminatoriaRondaKey[],
  key: EliminatoriaRondaKey,
  enabled: boolean
): EliminatoriaRondaKey[] {
  const field = ELIMINATORIA_RONDA_FIELDS.find((item) => item.key === key);
  if (field?.required) return parseEliminatoriaRondasActivas({ activas });
  const next = new Set(activas);
  if (enabled) {
    next.add(key);
    if (key === "octavos") next.add("cuartos");
  } else {
    next.delete(key);
    if (key === "cuartos") next.delete("octavos");
  }
  return parseEliminatoriaRondasActivas({ activas: Array.from(next) });
}

export function faseFromRondasActivas(
  activas: readonly EliminatoriaRondaKey[]
): TorneoExpressFaseEliminacion {
  if (activas.includes("octavos")) return "octavos";
  if (activas.includes("cuartos")) return "cuartos";
  return "semifinal";
}

export function rondasFromFase(
  fase: TorneoExpressFaseEliminacion | null | undefined
): EliminatoriaRondaKey[] {
  if (fase === "octavos") {
    return ["octavos", "cuartos", "semifinal", "final"];
  }
  if (fase === "semifinal") return ["semifinal", "final"];
  return [...DEFAULT_ELIMINATORIA_RONDAS_ACTIVAS];
}

export function unionEliminatoriaRondas(
  byCategoria: Record<string, readonly EliminatoriaRondaKey[]>
): EliminatoriaRondaKey[] {
  const lists = Object.values(byCategoria);
  if (lists.length === 0) return [...DEFAULT_ELIMINATORIA_RONDAS_ACTIVAS];
  const picked = new Set<EliminatoriaRondaKey>();
  for (const rondas of lists) {
    for (const key of rondas) picked.add(key);
  }
  for (const field of ELIMINATORIA_RONDA_FIELDS) {
    if (field.required) picked.add(field.key);
  }
  return ELIMINATORIA_RONDA_FIELDS.map((field) => field.key).filter((key) =>
    picked.has(key)
  );
}

export function isCategoriaEliminatoriaLocked(
  faseTorneo: string | null | undefined
): boolean {
  return faseTorneo === "eliminatoria" || faseTorneo === "cerrado";
}

export function sameCategoriaRondas(
  categorias: ReadonlyArray<{
    id: string;
    fase_eliminacion?: TorneoExpressFaseEliminacion | null;
  }>,
  draft: Record<string, readonly EliminatoriaRondaKey[]>
): boolean {
  return categorias.every((cat) => {
    const saved = rondasFromFase(cat.fase_eliminacion).join(",");
    const next = (draft[cat.id] ?? rondasFromFase(cat.fase_eliminacion)).join(
      ","
    );
    return saved === next;
  });
}

export function inferFaseEliminacion(
  categoriaFase: TorneoExpressFaseEliminacion | null | undefined,
  duraciones?: unknown
): TorneoExpressFaseEliminacion {
  if (
    categoriaFase === "octavos" ||
    categoriaFase === "cuartos" ||
    categoriaFase === "semifinal"
  ) {
    return categoriaFase;
  }
  return faseFromRondasActivas(parseEliminatoriaRondasActivas(duraciones));
}

export function serializeEliminatoriaDuraciones(
  minutes: unknown,
  activas: readonly EliminatoriaRondaKey[],
  faseOrden?: readonly string[] | null
): EliminatoriaDuraciones & {
  activas: EliminatoriaRondaKey[];
  fase_orden?: string[];
} {
  const payload: EliminatoriaDuraciones & {
    activas: EliminatoriaRondaKey[];
    fase_orden?: string[];
  } = {
    ...normalizeEliminatoriaDuraciones(minutes),
    activas: parseEliminatoriaRondasActivas({ activas }),
  };
  const keys = (faseOrden ?? [])
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  if (keys.length > 0) payload.fase_orden = keys;
  return payload;
}

export function rondaPathLabel(
  activas: readonly EliminatoriaRondaKey[]
): string {
  return ELIMINATORIA_RONDA_FIELDS.filter((field) => activas.includes(field.key))
    .map((field) => field.label)
    .join(" → ");
}

/** Oleadas de una ronda: partidos en paralelo según canchas. */
export function rondaWaveCount(
  matchCount: number,
  courtCount: number
): number {
  return Math.ceil(Math.max(1, matchCount) / Math.max(1, courtCount));
}

/**
 * Minutos de cuadro de una categoría: cada ronda dura
 * oleadas × minutos, no un solo bloque.
 */
export function categoriaKnockoutMinutes(
  fase: TorneoExpressFaseEliminacion | null | undefined,
  duraciones?: unknown,
  courtCount = 1
): number {
  const d = normalizeEliminatoriaDuraciones(duraciones);
  const resolved = inferFaseEliminacion(fase, duraciones);
  const courts = Math.max(1, courtCount);
  const add = (matches: number, minutes: number) =>
    rondaWaveCount(matches, courts) * minutes;
  if (resolved === "semifinal") {
    return add(2, d.semifinal) + add(1, d.final);
  }
  if (resolved === "octavos") {
    return (
      add(8, d.octavos) +
      add(4, d.cuartos) +
      add(2, d.semifinal) +
      add(1, d.final)
    );
  }
  return add(4, d.cuartos) + add(2, d.semifinal) + add(1, d.final);
}

export function parseEliminatoriaInicio(
  startIso: string | null | undefined
): Date | null {
  if (!startIso?.trim()) return null;
  const ms = new Date(startIso).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
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

export type EliminatoriaFaseBloque = {
  torneoId: string;
  ronda: EliminatoriaRondaKey;
};

export type EliminatoriaFaseMatchSlot = {
  cruceIndex: number;
  startMs: number | null;
  courtIndex: number;
};

export type EliminatoriaFaseTimelineEntry = EliminatoriaFaseBloque & {
  rondaNumber: number;
  matchCount: number;
  startsAtMs: number | null;
  durationMin: number;
  matches: EliminatoriaFaseMatchSlot[];
};

function assignMatchesToFreeCourts(
  matchCount: number,
  durationMin: number,
  courtFreeAt: number[],
  notBefore: number
): EliminatoriaFaseMatchSlot[] {
  const durationMs = durationMin * 60 * 1000;
  const matches: EliminatoriaFaseMatchSlot[] = [];
  for (let cruceIndex = 0; cruceIndex < matchCount; cruceIndex += 1) {
    let courtIndex = 0;
    let startMs = Math.max(courtFreeAt[0] ?? notBefore, notBefore);
    for (let index = 1; index < courtFreeAt.length; index += 1) {
      const candidate = Math.max(courtFreeAt[index] ?? notBefore, notBefore);
      if (candidate < startMs) {
        courtIndex = index;
        startMs = candidate;
      }
    }
    matches.push({ cruceIndex, startMs, courtIndex });
    courtFreeAt[courtIndex] = startMs + durationMs;
  }
  return matches;
}

const FASE_ORDEN_KEY =
  /^[0-9a-f-]{8,}:(?:octavos|cuartos|semifinal|final)$/i;

export function faseBloqueKey(bloque: EliminatoriaFaseBloque): string {
  return `${bloque.torneoId}:${bloque.ronda}`;
}

export function parseFaseOrden(raw: unknown): string[] | null {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!obj || !Array.isArray(obj.fase_orden)) return null;
  const keys = obj.fase_orden
    .map((item) => String(item ?? "").trim())
    .filter((key) => FASE_ORDEN_KEY.test(key));
  return keys.length > 0 ? keys : null;
}

function rondaNumberForFase(
  fase: TorneoExpressFaseEliminacion,
  ronda: EliminatoriaRondaKey
): number | null {
  const start = fase === "octavos" ? 0 : fase === "cuartos" ? 1 : 2;
  const index = ELIMINATORIA_RONDA_FIELDS.findIndex((field) => field.key === ronda);
  if (index < start) return null;
  return index - start + 1;
}

function rondasForCategoria(
  cat: CategoriaOrdenable,
  rondasByCategoria?: Record<string, readonly EliminatoriaRondaKey[]>
): EliminatoriaRondaKey[] {
  const listed = rondasByCategoria?.[cat.id];
  if (listed && listed.length > 0) {
    return parseEliminatoriaRondasActivas({ activas: listed });
  }
  return rondasFromFase(cat.fase_eliminacion);
}

function faseForCategoria(
  cat: CategoriaOrdenable,
  rondasByCategoria?: Record<string, readonly EliminatoriaRondaKey[]>
): TorneoExpressFaseEliminacion {
  if (rondasByCategoria?.[cat.id]) {
    return faseFromRondasActivas(rondasForCategoria(cat, rondasByCategoria));
  }
  return inferFaseEliminacion(cat.fase_eliminacion);
}

/** Por defecto: todos los cuartos, luego todas las semis, luego las finales. */
export function defaultFaseBloques(
  categorias: readonly CategoriaOrdenable[],
  savedIds: readonly string[] | null | undefined,
  rondasByCategoria?: Record<string, readonly EliminatoriaRondaKey[]>
): EliminatoriaFaseBloque[] {
  const ordered = orderCategoriasForEliminatoria(categorias, savedIds);
  const bloques: EliminatoriaFaseBloque[] = [];
  for (const field of ELIMINATORIA_RONDA_FIELDS) {
    for (const cat of ordered) {
      const fase = faseForCategoria(cat, rondasByCategoria);
      if (rondaNumberForFase(fase, field.key) == null) continue;
      if (!rondasForCategoria(cat, rondasByCategoria).includes(field.key)) {
        continue;
      }
      bloques.push({ torneoId: cat.id, ronda: field.key });
    }
  }
  return bloques;
}

export function reconcileFaseBloques(
  savedKeys: readonly string[] | null | undefined,
  canonical: readonly EliminatoriaFaseBloque[]
): EliminatoriaFaseBloque[] {
  const byKey = new Map(canonical.map((bloque) => [faseBloqueKey(bloque), bloque]));
  const used = new Set<string>();
  const out: EliminatoriaFaseBloque[] = [];
  for (const key of savedKeys ?? []) {
    const bloque = byKey.get(key);
    if (!bloque || used.has(key)) continue;
    out.push(bloque);
    used.add(key);
  }
  if (out.length === 0 && (savedKeys?.length ?? 0) > 0) return [...canonical];
  for (const bloque of canonical) {
    const key = faseBloqueKey(bloque);
    if (used.has(key)) continue;
    out.push(bloque);
  }
  return out;
}

/** Mantiene el orden de las rondas y reordena las categorías dentro de cada una. */
export function realignFasesToCategoriaOrden(
  fases: readonly EliminatoriaFaseBloque[],
  categoriaIds: readonly string[]
): EliminatoriaFaseBloque[] {
  const rank = new Map(categoriaIds.map((id, index) => [id, index]));
  const result = fases.slice();
  for (const field of ELIMINATORIA_RONDA_FIELDS) {
    const indexes: number[] = [];
    const blocks: EliminatoriaFaseBloque[] = [];
    result.forEach((bloque, index) => {
      if (bloque.ronda !== field.key) return;
      indexes.push(index);
      blocks.push(bloque);
    });
    blocks.sort(
      (a, b) =>
        (rank.get(a.torneoId) ?? 999) - (rank.get(b.torneoId) ?? 999)
    );
    indexes.forEach((index, position) => {
      result[index] = blocks[position];
    });
  }
  return result;
}

export function buildEliminatoriaFaseTimeline(input: {
  categorias: readonly CategoriaOrdenable[];
  categoriaOrden?: readonly string[] | null;
  rondasByCategoria?: Record<string, readonly EliminatoriaRondaKey[]>;
  faseOrden?: readonly string[] | null;
  startAt?: Date | null;
  courtCount?: number;
  duraciones?: unknown;
}): EliminatoriaFaseTimelineEntry[] {
  const canonical = defaultFaseBloques(
    input.categorias,
    input.categoriaOrden,
    input.rondasByCategoria
  );
  const bloques = reconcileFaseBloques(
    input.faseOrden ?? parseFaseOrden(input.duraciones),
    canonical
  );
  const byId = new Map(input.categorias.map((cat) => [cat.id, cat]));
  const minutes = normalizeEliminatoriaDuraciones(input.duraciones);
  const courts = Math.max(1, input.courtCount ?? 1);
  const startMs = input.startAt?.getTime();
  const hasStart = startMs != null && Number.isFinite(startMs);
  const courtFreeAt = Array.from({ length: courts }, () =>
    hasStart ? startMs : 0
  );
  const roundEndByCategory = new Map<string, number>();
  const entries: EliminatoriaFaseTimelineEntry[] = [];

  for (const bloque of bloques) {
    const cat = byId.get(bloque.torneoId);
    if (!cat) continue;
    const fase = faseForCategoria(cat, input.rondasByCategoria);
    const rondaNumber = rondaNumberForFase(fase, bloque.ronda);
    if (rondaNumber == null) continue;
    const matchCount = Math.max(
      1,
      BRACKET_FASE_SLOTS[fase] / 2 ** rondaNumber
    );
    const durationMin = minutes[bloque.ronda];
    const previousEnd = roundEndByCategory.get(
      `${bloque.torneoId}:${rondaNumber - 1}`
    );
    const notBefore = hasStart ? Math.max(startMs, previousEnd ?? startMs) : null;
    const matches =
      notBefore == null
        ? Array.from({ length: matchCount }, (_, cruceIndex) => ({
            cruceIndex,
            startMs: null,
            courtIndex: cruceIndex % courts,
          }))
        : assignMatchesToFreeCourts(
            matchCount,
            durationMin,
            courtFreeAt,
            notBefore
          );
    if (notBefore != null) {
      const durationMs = durationMin * 60 * 1000;
      const roundEnd = matches.reduce(
        (max, match) => Math.max(max, (match.startMs ?? notBefore) + durationMs),
        notBefore
      );
      roundEndByCategory.set(`${bloque.torneoId}:${rondaNumber}`, roundEnd);
    }
    const starts = matches
      .map((match) => match.startMs)
      .filter((value): value is number => value != null);
    entries.push({
      ...bloque,
      rondaNumber,
      matchCount,
      startsAtMs: starts.length > 0 ? Math.min(...starts) : null,
      durationMin,
      matches,
    });
  }
  return entries;
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
  const timeline = buildEliminatoriaFaseTimeline({
    categorias,
    categoriaOrden: savedIds,
    faseOrden: parseFaseOrden(duraciones),
    startAt: parseEliminatoriaInicio(startIso),
    courtCount: Math.max(1, courts.length),
    duraciones,
  });
  return ordered.map((cat) => {
    const first = timeline.find((entry) => entry.torneoId === cat.id);
    return {
      torneoId: cat.id,
      label: categoriaOrdenLabel(cat),
      startsAt:
        first?.startsAtMs != null ? new Date(first.startsAtMs) : null,
      href: `/torneo-express/${cat.id}/eliminatoria`,
      courts,
    };
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
