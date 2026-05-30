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

function columnSide(
  colIndex: number,
  centerIndex: number
): "left" | "center" | "right" {
  if (colIndex === centerIndex) return "center";
  return colIndex < centerIndex ? "left" : "right";
}

function buildFinalPlaceholder(
  allCards: PublicMatchupCard[],
  totalRondas: number
): BracketVisualSlot {
  const semiRound = totalRondas - 1;
  const semiCards =
    allCards
      .filter((c) => c.ronda === semiRound)
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
  totalRondas: number
): PublicBracketVisualLayout {
  const columnCount = Math.max(1, totalRondas * 2 - 1);
  const centerColumnIndex = totalRondas - 1;
  const byRound = cardsByRound(allCards);

  const columns: BracketVisualColumn[] = Array.from(
    { length: columnCount },
    (_, index) => ({
      index,
      side: columnSide(index, centerColumnIndex),
      slots: [],
    })
  );

  const connectors: BracketConnector[] = [];

  for (let ronda = 1; ronda <= totalRondas; ronda++) {
    const roundCards = byRound.get(ronda) ?? [];
    const leftCol = ronda - 1;
    const rightCol = columnCount - ronda;

    if (ronda === totalRondas) {
      if (roundCards.length > 0) {
        roundCards.forEach((card) => {
          columns[centerColumnIndex].slots.push({
            kind: "match",
            card,
            isCenter: true,
          });
        });
      } else {
        columns[centerColumnIndex].slots.push(
          buildFinalPlaceholder(allCards, totalRondas)
        );
      }
      continue;
    }

    const { left, right } = splitRound(roundCards);
    left.forEach((card, slotIndex) => {
      columns[leftCol].slots.push({ kind: "match", card });
      connectors.push({
        id: `L-${ronda}-${slotIndex}`,
        fromSide: "left",
        slotIndex: columns[leftCol].slots.length - 1,
        hasWinner: card.status === "finished" && Boolean(winnerLabel(card)),
      });
    });
    right.forEach((card, slotIndex) => {
      columns[rightCol].slots.push({ kind: "match", card });
      connectors.push({
        id: `R-${ronda}-${slotIndex}`,
        fromSide: "right",
        slotIndex: columns[rightCol].slots.length - 1,
        hasWinner: card.status === "finished" && Boolean(winnerLabel(card)),
      });
    });
  }

  if (columns.every((c) => c.slots.length === 0) && allCards.length > 0) {
    const { left, right } = splitRound(allCards);
    left.forEach((card) => {
      columns[0].slots.push({ kind: "match", card });
    });
    right.forEach((card) => {
      columns[columnCount - 1].slots.push({ kind: "match", card });
    });
    columns[centerColumnIndex].slots.push(
      buildFinalPlaceholder(allCards, totalRondas)
    );
  }

  const centerSlots = columns[centerColumnIndex]?.slots ?? [];
  const sideSlots: BracketVisualSlot[] = [];

  columns.forEach((col, i) => {
    if (i === centerColumnIndex) return;
    sideSlots.push(...col.slots);
  });

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
