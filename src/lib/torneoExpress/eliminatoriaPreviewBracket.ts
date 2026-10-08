import { BRACKET_FASE_SLOTS } from "./bracketTypes";
import {
  labelRondaEliminatoria,
  totalRondasEliminatoria,
} from "./bracketRounds";
import { formatCanchaDisplay } from "./canchaDisplay";
import { resolveEventoTimeZone } from "./eventoTemporal";
import {
  normalizeEliminatoriaCanchas,
  normalizeEliminatoriaDuraciones,
  type EliminatoriaDuraciones,
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
    return `${t1} – ${t2}`;
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

export function buildEliminatoriaPreviewCards(input: {
  fase?: TorneoExpressFaseEliminacion | null;
  startAt?: Date | null;
  courts?: readonly string[] | null;
  duraciones?: unknown;
  timeZone?: string | null;
}): { cards: PublicMatchupCard[]; totalRondas: number; fase: TorneoExpressFaseEliminacion } {
  const fase = resolvePreviewFase(input.fase);
  const slots = BRACKET_FASE_SLOTS[fase];
  const totalRondas = totalRondasEliminatoria(fase, slots);
  const courts = normalizeEliminatoriaCanchas(input.courts);
  const courtCount = Math.max(1, courts.length);
  const duraciones = normalizeEliminatoriaDuraciones(input.duraciones);
  const startMs =
    input.startAt && Number.isFinite(input.startAt.getTime())
      ? input.startAt.getTime()
      : null;

  const cards: PublicMatchupCard[] = [];
  let cursor = startMs;

  for (let ronda = 1; ronda <= totalRondas; ronda += 1) {
    const matchCount = Math.max(1, slots / 2 ** ronda);
    const roundLabel = labelRondaEliminatoria(fase, ronda, totalRondas);
    const roundUpper = roundLabelUpper(fase, ronda, totalRondas);
    const durationMin = minutesForPreviewRound(roundLabel, duraciones);
    const waves = Math.ceil(matchCount / courtCount);

    for (let i = 0; i < matchCount; i += 1) {
      const wave = Math.floor(i / courtCount);
      const matchStart =
        cursor == null ? null : cursor + wave * durationMin * 60 * 1000;
      const court = courts.length > 0 ? courts[i % courtCount] : null;
      cards.push({
        id: `preview-r${ronda}-${i}`,
        ronda,
        cruceIndex: i,
        roundLabel,
        matchTitle: matchTitle(roundUpper, i, matchCount),
        local: { ...TBD_TEAM },
        visit: { ...TBD_TEAM },
        status: "pending",
        horaDisplay: formatPreviewWindow(matchStart, durationMin, input.timeZone),
        scheduleMs: matchStart,
        puntosLocal: null,
        puntosVisitante: null,
        sets: [],
        canchaLabel: court ? formatCanchaDisplay(court) : null,
      });
    }

    if (cursor != null) {
      cursor += waves * durationMin * 60 * 1000;
    }
  }

  return { cards, totalRondas, fase };
}
