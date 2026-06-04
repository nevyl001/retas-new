import { isRondaTercerLugar } from "./bracketRounds";
import type { PublicMatchupCard } from "./publicBracketModel";

export type BracketSlotKind = "match" | "final-placeholder";

export interface BracketVisualSlot {
  kind: BracketSlotKind;
  card: PublicMatchupCard | null;
  /** Solo para final sin partido creado aún. */
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
  /** Columna origen (lado del partido). */
  fromSide: "left" | "right";
  /** Índice del slot en su columna. */
  slotIndex: number;
  /** Hay ganador confirmado en ese partido. */
  hasWinner: boolean;
}

export interface PublicBracketVisualLayout {
  totalRondas: number;
  columnCount: number;
  centerColumnIndex: number;
  columns: BracketVisualColumn[];
  connectors: BracketConnector[];
  /** Orden mobile: semis primero, final al final. */
  mobileSlots: BracketVisualSlot[];
}

function cardsByRound(
  cards: PublicMatchupCard[]
): Map<number, PublicMatchupCard[]> {
  const map = new Map<number, PublicMatchupCard[]>();
  cards.forEach((c) => {
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

/** Ronda que se muestra en columnas laterales (siempre antes de la final). */
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
    if (allCards.some((c) => c.ronda === r)) return r;
  }
  return 1;
}

function buildFinalPlaceholder(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  sideRound: number
): BracketVisualSlot {
  const semiCards =
    allCards
      .filter((c) => c.ronda === sideRound)
      .sort((a, b) => a.cruceIndex - b.cruceIndex) ?? [];
  const { left, right } = splitRound(semiCards);

  const top =
    left[0] && left[0].status === "finished"
      ? winnerLabel(left[0]) ?? "Por definir"
      : "Por definir";
  const bottom =
    right[0] && right[0].status === "finished"
      ? winnerLabel(right[0]) ?? "Por definir"
      : "Por definir";

  return {
    kind: "final-placeholder",
    card: null,
    finalistTop: top,
    finalistBottom: bottom,
    isCenter: true,
  };
}

export function buildPublicBracketVisualLayout(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  activeRonda?: number
): PublicBracketVisualLayout {
  const columnCount = 3;
  const centerColumnIndex = 1;
  const sideRound = resolveSideRound(allCards, totalRondas, activeRonda);
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

  const finalCards = byRound.get(totalRondas) ?? [];
  const tercerCards = allCards.filter((c) => isRondaTercerLugar(c.ronda));

  if (finalCards.length > 0) {
    finalCards.forEach((card) => {
      columns[1].slots.push({
        kind: "match",
        card,
        isCenter: true,
      });
    });
  } else {
    columns[1].slots.push(
      buildFinalPlaceholder(allCards, totalRondas, sideRound)
    );
  }

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
    const { left: fallbackLeft, right: fallbackRight } = splitRound(allCards);
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
    const ra = a.card?.ronda ?? 0;
    const rb = b.card?.ronda ?? 0;
    if (ra !== rb) return ra - rb;
    return (a.card?.cruceIndex ?? 0) - (b.card?.cruceIndex ?? 0);
  });

  const mobileSlots = [...sideSlots, ...centerSlots];

  return {
    totalRondas,
    columnCount,
    centerColumnIndex,
    columns,
    connectors,
    mobileSlots,
  };
}
