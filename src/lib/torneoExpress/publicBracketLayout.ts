import { isRondaTercerLugar } from "./bracketRounds";
import type { PublicMatchupCard } from "./publicBracketModel";

export type BracketSlotKind = "match" | "round-placeholder";

export interface BracketVisualSlot {
  kind: BracketSlotKind;
  card: PublicMatchupCard | null;
  /** Ronda que representa el placeholder (semis, final, etc.). */
  placeholderRound?: number;
  placeholderIndex?: number;
  finalistTop?: string;
  finalistBottom?: string;
  isCenter?: boolean;
}

export interface BracketVisualColumn {
  index: number;
  side: "left" | "center" | "right";
  slots: BracketVisualSlot[];
}

export interface BracketConnector {
  id: string;
  fromSide: "left" | "right";
  slotIndex: number;
  hasWinner: boolean;
}

export interface PublicBracketVisualLayout {
  totalRondas: number;
  sideRound: number;
  centerRound: number;
  columnCount: number;
  centerColumnIndex: number;
  columns: BracketVisualColumn[];
  connectors: BracketConnector[];
  mobileSlots: BracketVisualSlot[];
}

function cardsByRound(
  cards: PublicMatchupCard[]
): Map<number, PublicMatchupCard[]> {
  const map = new Map<number, PublicMatchupCard[]>();
  cards.forEach((c) => {
    if (isRondaTercerLugar(c.ronda)) return;
    const list = map.get(c.ronda) ?? [];
    list.push(c);
    map.set(c.ronda, list);
  });
  map.forEach((list, r) => {
    map.set(
      r,
      [...list].sort((a, b) => a.cruceIndex - b.cruceIndex)
    );
  });
  return map;
}

function splitRound(
  cards: PublicMatchupCard[]
): { left: PublicMatchupCard[]; right: PublicMatchupCard[] } {
  const sorted = [...cards].sort((a, b) => a.cruceIndex - b.cruceIndex);
  const mid = Math.ceil(sorted.length / 2);
  return {
    left: sorted.slice(0, mid),
    right: sorted.slice(mid),
  };
}

function winnerLabel(card: PublicMatchupCard): string | null {
  if (card.local.isWinner) return card.local.label;
  if (card.visit.isWinner) return card.visit.label;
  return null;
}

/** Ronda que se muestra en columnas laterales (siempre antes del centro). */
function resolveSideRound(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  activeRonda?: number
): number {
  if (totalRondas <= 1) return 1;

  if (activeRonda != null) {
    if (activeRonda < totalRondas) return activeRonda;
    return Math.max(1, totalRondas - 1);
  }

  for (let r = 1; r < totalRondas; r++) {
    if (allCards.some((c) => c.ronda === r && !isRondaTercerLugar(c.ronda))) {
      return r;
    }
  }
  return 1;
}

function teamLabelFromFinished(card: PublicMatchupCard): string {
  if (card.status !== "finished") return "Por definir";
  return winnerLabel(card) ?? "Por definir";
}

function buildPairPlaceholder(
  cardA: PublicMatchupCard,
  cardB: PublicMatchupCard,
  placeholderRound: number,
  placeholderIndex: number
): BracketVisualSlot {
  return {
    kind: "round-placeholder",
    card: null,
    placeholderRound,
    placeholderIndex,
    finalistTop: teamLabelFromFinished(cardA),
    finalistBottom: teamLabelFromFinished(cardB),
    isCenter: true,
  };
}

function buildFinalPlaceholder(
  sideRoundCards: PublicMatchupCard[],
  placeholderRound: number
): BracketVisualSlot {
  const { left, right } = splitRound(sideRoundCards);
  return {
    kind: "round-placeholder",
    card: null,
    placeholderRound,
    placeholderIndex: 0,
    finalistTop:
      left[0] != null ? teamLabelFromFinished(left[0]) : "Por definir",
    finalistBottom:
      right[0] != null ? teamLabelFromFinished(right[0]) : "Por definir",
    isCenter: true,
  };
}

/** Placeholders de la ronda central cuando aún no hay partidos creados. */
function buildCenterPlaceholders(
  prevRoundCards: PublicMatchupCard[],
  centerRound: number,
  totalRondas: number
): BracketVisualSlot[] {
  if (centerRound >= totalRondas) {
    return [buildFinalPlaceholder(prevRoundCards, centerRound)];
  }

  const { left, right } = splitRound(prevRoundCards);
  const slots: BracketVisualSlot[] = [];

  if (left.length >= 2) {
    slots.push(
      buildPairPlaceholder(left[0], left[1], centerRound, slots.length)
    );
  } else if (left.length === 1 && right.length >= 1) {
    slots.push(
      buildPairPlaceholder(left[0], right[0], centerRound, slots.length)
    );
  }

  if (right.length >= 2) {
    slots.push(
      buildPairPlaceholder(right[0], right[1], centerRound, slots.length)
    );
  }

  if (slots.length === 0 && prevRoundCards.length > 0) {
    return [buildFinalPlaceholder(prevRoundCards, centerRound)];
  }

  return slots;
}

function buildCenterSlots(
  byRound: Map<number, PublicMatchupCard[]>,
  sideRound: number,
  totalRondas: number
): BracketVisualSlot[] {
  const centerRound = Math.min(sideRound + 1, totalRondas);
  const centerCards = byRound.get(centerRound) ?? [];

  if (centerCards.length > 0) {
    return centerCards.map((card) => ({
      kind: "match" as const,
      card,
      isCenter: true,
    }));
  }

  const prevRoundCards = byRound.get(sideRound) ?? [];
  return buildCenterPlaceholders(prevRoundCards, centerRound, totalRondas);
}

export function buildPublicBracketVisualLayout(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  activeRonda?: number
): PublicBracketVisualLayout {
  const columnCount = 3;
  const centerColumnIndex = 1;
  const sideRound = resolveSideRound(allCards, totalRondas, activeRonda);
  const centerRound = Math.min(sideRound + 1, totalRondas);
  const byRound = cardsByRound(allCards);

  const columns: BracketVisualColumn[] = [
    { index: 0, side: "left", slots: [] },
    { index: 1, side: "center", slots: [] },
    { index: 2, side: "right", slots: [] },
  ];

  const connectors: BracketConnector[] = [];

  const sideRoundCards = byRound.get(sideRound) ?? [];
  const { left, right } = splitRound(sideRoundCards);

  left.forEach((card, slotIndex) => {
    columns[0].slots.push({ kind: "match", card });
    connectors.push({
      id: `L-${sideRound}-${slotIndex}`,
      fromSide: "left",
      slotIndex: columns[0].slots.length - 1,
      hasWinner: card.status === "finished" && Boolean(winnerLabel(card)),
    });
  });

  right.forEach((card, slotIndex) => {
    columns[2].slots.push({ kind: "match", card });
    connectors.push({
      id: `R-${sideRound}-${slotIndex}`,
      fromSide: "right",
      slotIndex: columns[2].slots.length - 1,
      hasWinner: card.status === "finished" && Boolean(winnerLabel(card)),
    });
  });

  columns[1].slots.push(...buildCenterSlots(byRound, sideRound, totalRondas));

  const tercerCards = allCards.filter((c) => isRondaTercerLugar(c.ronda));
  if (tercerCards.length > 0) {
    tercerCards.forEach((card) => {
      columns[1].slots.push({
        kind: "match",
        card,
        isCenter: false,
      });
    });
  }

  if (
    columns[0].slots.length === 0 &&
    columns[2].slots.length === 0 &&
    allCards.length > 0
  ) {
    const playable = allCards.filter((c) => !isRondaTercerLugar(c.ronda));
    const { left: fallbackLeft, right: fallbackRight } = splitRound(playable);
    fallbackLeft.forEach((card) => {
      columns[0].slots.push({ kind: "match", card });
    });
    fallbackRight.forEach((card) => {
      columns[2].slots.push({ kind: "match", card });
    });
  }

  const centerSlots = columns[centerColumnIndex].slots;
  const sideSlots: BracketVisualSlot[] = [
    ...columns[0].slots,
    ...columns[2].slots,
  ];

  sideSlots.sort((a, b) => {
    const ra = a.card?.ronda ?? a.placeholderRound ?? 0;
    const rb = b.card?.ronda ?? b.placeholderRound ?? 0;
    if (ra !== rb) return ra - rb;
    const ia = a.card?.cruceIndex ?? a.placeholderIndex ?? 0;
    const ib = b.card?.cruceIndex ?? b.placeholderIndex ?? 0;
    return ia - ib;
  });

  const mobileSlots = [...sideSlots, ...centerSlots];

  return {
    totalRondas,
    sideRound,
    centerRound,
    columnCount,
    centerColumnIndex,
    columns,
    connectors,
    mobileSlots,
  };
}
