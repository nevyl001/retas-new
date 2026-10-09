import { BRACKET_FASE_SLOTS } from "./bracketTypes";
import {
  labelRondaEliminatoria,
  totalRondasEliminatoria,
} from "./bracketRounds";
import { formatCanchaDisplay } from "./canchaDisplay";
import { resolveEventoTimeZone } from "./eventoTemporal";
import {
  buildEliminatoriaFaseTimeline,
  normalizeEliminatoriaCanchas,
  normalizeEliminatoriaDuraciones,
  type CategoriaOrdenable,
  type EliminatoriaDuraciones,
  type EliminatoriaRondaKey,
} from "./eliminatoriaCategoriaOrden";
import type { PublicBracketTeam, PublicMatchupCard } from "./publicBracketModel";
import type { TorneoExpressFaseEliminacion } from "./types";

const TBD_TEAM: PublicBracketTeam = {
  parejaId: null,
  label: "",
  seed: null,
  originBadge: null,
  isBye: false,
  isWinner: false,
  score: null,
};

function roundLabelUpper(
  fase: TorneoExpressFaseEliminacion,
  ronda: number,
  totalRondas: number
): string {
  const label = labelRondaEliminatoria(fase, ronda, totalRondas);
  if (label === "Tercer lugar") return "TERCER LUGAR";
  if (label === "Final") return "FINAL";
  if (label === "Semifinal") return "SEMIFINALES";
  if (label === "Cuartos de final") return "CUARTOS DE FINAL";
  if (label === "Octavos de final") return "OCTAVOS DE FINAL";
  return label.toUpperCase();
}

function matchTitle(
  roundLabel: string,
  cruceIndex: number,
  totalInRound: number
): string {
  if (roundLabel === "FINAL") return "FINAL";
  if (totalInRound <= 1) return roundLabel;
  const singular = roundLabel
    .replace(/SEMIFINALES\b/, "SEMIFINAL")
    .replace(/CUARTOS DE FINAL\b/, "CUARTOS")
    .replace(/OCTAVOS DE FINAL\b/, "OCTAVOS");
  return `${singular} ${cruceIndex + 1}`;
}

export function minutesForPreviewRound(
  roundLabel: string,
  duraciones: EliminatoriaDuraciones
): number {
  const n = roundLabel.toLowerCase();
  if (n.includes("octavo")) return duraciones.octavos;
  if (n.includes("cuarto")) return duraciones.cuartos;
  if (n.includes("semi")) return duraciones.semifinal;
  return duraciones.final;
}

function capitalizeEs(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatPreviewDay(
  startMs: number | null,
  timeZone?: string | null
): string {
  if (startMs == null || !Number.isFinite(startMs)) return "";
  try {
    const day = new Date(startMs).toLocaleDateString("es-MX", {
      timeZone: resolveEventoTimeZone(timeZone),
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return capitalizeEs(day);
  } catch {
    return "";
  }
}

export function formatPreviewWindow(
  startMs: number | null,
  durationMin: number,
  timeZone?: string | null
): string {
  if (startMs == null || !Number.isFinite(startMs)) return "";
  try {
    const tz = resolveEventoTimeZone(timeZone);
    const start = new Date(startMs);
    const end = new Date(startMs + durationMin * 60 * 1000);
    const day = start
      .toLocaleDateString("es-MX", {
        timeZone: tz,
        weekday: "short",
        day: "numeric",
        month: "short",
      })
      .replace(/\./g, "")
      .replace(/,/g, "")
      .replace(/\s+de\s+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const t1 = start.toLocaleTimeString("es-MX", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const t2 = end.toLocaleTimeString("es-MX", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${day} · ${t1} – ${t2}`;
  } catch {
    return "";
  }
}

export function resolvePreviewFase(
  fase: TorneoExpressFaseEliminacion | null | undefined
): TorneoExpressFaseEliminacion {
  if (fase === "octavos" || fase === "cuartos" || fase === "semifinal") {
    return fase;
  }
  return "cuartos";
}

export type ProjectedEliminatoriaMatchSlot = {
  ronda: number;
  cruceIndex: number;
  startMs: number | null;
  cancha: string | null;
  durationMin: number;
};

export function projectEliminatoriaMatchSlots(input: {
  fase?: TorneoExpressFaseEliminacion | null;
  startAt?: Date | null;
  courts?: readonly string[] | null;
  duraciones?: unknown;
}): {
  slots: ProjectedEliminatoriaMatchSlot[];
  totalRondas: number;
  fase: TorneoExpressFaseEliminacion;
} {
  const fase = resolvePreviewFase(input.fase);
  const bracketSlots = BRACKET_FASE_SLOTS[fase];
  const totalRondas = totalRondasEliminatoria(fase, bracketSlots);
  const courts = normalizeEliminatoriaCanchas(input.courts);
  const courtCount = Math.max(1, courts.length);
  const duraciones = normalizeEliminatoriaDuraciones(input.duraciones);
  const startMs =
    input.startAt && Number.isFinite(input.startAt.getTime())
      ? input.startAt.getTime()
      : null;

  const slots: ProjectedEliminatoriaMatchSlot[] = [];
  let cursor = startMs;

  for (let ronda = 1; ronda <= totalRondas; ronda += 1) {
    const matchCount = Math.max(1, bracketSlots / 2 ** ronda);
    const roundLabel = labelRondaEliminatoria(fase, ronda, totalRondas);
    const durationMin = minutesForPreviewRound(roundLabel, duraciones);
    const waves = Math.ceil(matchCount / courtCount);

    for (let i = 0; i < matchCount; i += 1) {
      const wave = Math.floor(i / courtCount);
      slots.push({
        ronda,
        cruceIndex: i,
        startMs:
          cursor == null ? null : cursor + wave * durationMin * 60 * 1000,
        cancha: courts.length > 0 ? courts[i % courtCount] : null,
        durationMin,
      });
    }

    if (cursor != null) {
      cursor += waves * durationMin * 60 * 1000;
    }
  }

  return { slots, totalRondas, fase };
}

export function matchSlotsFromFaseTimeline(input: {
  categorias: readonly CategoriaOrdenable[];
  categoriaOrden?: readonly string[] | null;
  rondasByCategoria?: Record<string, readonly EliminatoriaRondaKey[]>;
  faseOrden?: readonly string[] | null;
  startAt?: Date | null;
  courts?: readonly string[] | null;
  duraciones?: unknown;
}): Record<string, ProjectedEliminatoriaMatchSlot[]> {
  const courts = normalizeEliminatoriaCanchas(input.courts);
  const timeline = buildEliminatoriaFaseTimeline({
    categorias: input.categorias,
    categoriaOrden: input.categoriaOrden,
    rondasByCategoria: input.rondasByCategoria,
    faseOrden: input.faseOrden,
    startAt: input.startAt,
    courtCount: Math.max(1, courts.length),
    duraciones: input.duraciones,
  });
  const byTorneo: Record<string, ProjectedEliminatoriaMatchSlot[]> = {};
  for (const entry of timeline) {
    const slots = byTorneo[entry.torneoId] ?? [];
    for (const match of entry.matches) {
      slots.push({
        ronda: entry.rondaNumber,
        cruceIndex: match.cruceIndex,
        startMs: match.startMs,
        cancha:
          courts.length > 0
            ? (courts[match.courtIndex] ?? courts[match.courtIndex % courts.length])
            : null,
        durationMin: entry.durationMin,
      });
    }
    byTorneo[entry.torneoId] = slots;
  }
  return byTorneo;
}

export function buildEliminatoriaPreviewCards(input: {
  fase?: TorneoExpressFaseEliminacion | null;
  startAt?: Date | null;
  courts?: readonly string[] | null;
  duraciones?: unknown;
  timeZone?: string | null;
}): { cards: PublicMatchupCard[]; totalRondas: number; fase: TorneoExpressFaseEliminacion } {
  const { slots, totalRondas, fase } = projectEliminatoriaMatchSlots(input);
  const bracketSlots = BRACKET_FASE_SLOTS[fase];

  const cards: PublicMatchupCard[] = slots.map((slot) => {
    const roundLabel = labelRondaEliminatoria(fase, slot.ronda, totalRondas);
    const roundUpper = roundLabelUpper(fase, slot.ronda, totalRondas);
    const matchCount = Math.max(1, bracketSlots / 2 ** slot.ronda);
    return {
      id: `preview-r${slot.ronda}-${slot.cruceIndex}`,
      ronda: slot.ronda,
      cruceIndex: slot.cruceIndex,
      roundLabel,
      matchTitle: matchTitle(roundUpper, slot.cruceIndex, matchCount),
      local: { ...TBD_TEAM },
      visit: { ...TBD_TEAM },
      status: "pending",
      horaDisplay: formatPreviewWindow(
        slot.startMs,
        slot.durationMin,
        input.timeZone
      ),
      scheduleMs: slot.startMs,
      puntosLocal: null,
      puntosVisitante: null,
      sets: [],
      canchaLabel: slot.cancha ? formatCanchaDisplay(slot.cancha) : null,
    };
  });

  return { cards, totalRondas, fase };
}

/** Tarjetas de vista previa usando el horario ya intercalado del evento. */
export function previewCardsFromProjectedSlots(input: {
  slots: ProjectedEliminatoriaMatchSlot[];
  fase: TorneoExpressFaseEliminacion;
  totalRondas: number;
  timeZone?: string | null;
}): PublicMatchupCard[] {
  const bracketSlots = BRACKET_FASE_SLOTS[input.fase];
  return input.slots.map((slot) => {
    const roundLabel = labelRondaEliminatoria(
      input.fase,
      slot.ronda,
      input.totalRondas
    );
    const roundUpper = roundLabelUpper(input.fase, slot.ronda, input.totalRondas);
    const matchCount = Math.max(1, bracketSlots / 2 ** slot.ronda);
    return {
      id: `preview-r${slot.ronda}-${slot.cruceIndex}`,
      ronda: slot.ronda,
      cruceIndex: slot.cruceIndex,
      roundLabel,
      matchTitle: matchTitle(roundUpper, slot.cruceIndex, matchCount),
      local: { ...TBD_TEAM },
      visit: { ...TBD_TEAM },
      status: "pending" as const,
      horaDisplay: formatPreviewWindow(
        slot.startMs,
        slot.durationMin,
        input.timeZone
      ),
      scheduleMs: slot.startMs,
      puntosLocal: null,
      puntosVisitante: null,
      sets: [],
      canchaLabel: slot.cancha ? formatCanchaDisplay(slot.cancha) : null,
    };
  });
}
