/**
 * @deprecated Prefer buildBracketPresentationModel for new UI.
 * Kept as a thin linear adapter for legacy layout tests migration.
 */
import { isRondaTercerLugar } from "./bracketRounds";
import {
  buildBracketPresentationModel,
  type BracketMatchPresentation,
} from "./publicBracketPresentation";
import type { PublicMatchupCard } from "./publicBracketModel";

export type BracketSlotKind = "match" | "round-placeholder";

export interface BracketVisualSlot {
  kind: BracketSlotKind;
  card: PublicMatchupCard | null;
  placeholderRound?: number;
  placeholderIndex?: number;
  finalistTop?: string;
  finalistBottom?: string;
  isCenter?: boolean;
  matchPresentation?: BracketMatchPresentation;
}

export interface BracketVisualColumn {
  index: number;
  side: "left" | "center" | "right" | "path";
  slots: BracketVisualSlot[];
  title?: string;
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

/**
 * Linear path adapter: one column per round (not mirrored).
 * Desktop TEPublicBracketVisual now uses buildBracketPresentationModel directly.
 */
export function buildPublicBracketVisualLayout(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  activeRonda?: number
): PublicBracketVisualLayout {
  const presentation = buildBracketPresentationModel(
    allCards,
    totalRondas,
    activeRonda
  );

  const columns: BracketVisualColumn[] = presentation.rounds.map(
    (round, index) => ({
      index,
      side: "path" as const,
      title: round.title,
      slots: round.matches.map((m) => {
        const card =
          allCards.find((c) => c.id === m.id) ??
          (m.isPlaceholder
            ? null
            : allCards.find(
                (c) => c.ronda === m.ronda && c.cruceIndex === m.cruceIndex
              ) ?? null);
        return {
          kind: (card ? "match" : "round-placeholder") as BracketSlotKind,
          card,
          placeholderRound: m.isPlaceholder ? m.ronda : undefined,
          placeholderIndex: m.cruceIndex,
          finalistTop:
            m.local.kind === "dependency" ? m.local.dependencyLabel ?? undefined : undefined,
          finalistBottom:
            m.visit.kind === "dependency" ? m.visit.dependencyLabel ?? undefined : undefined,
          isCenter: m.isFinal,
          matchPresentation: m,
        };
      }),
    })
  );

  if (presentation.thirdPlace) {
    columns.push({
      index: columns.length,
      side: "path",
      title: presentation.thirdPlace.title,
      slots: presentation.thirdPlace.matches.map((m) => ({
        kind: "match" as const,
        card: allCards.find((c) => isRondaTercerLugar(c.ronda)) ?? null,
        isCenter: false,
        matchPresentation: m,
      })),
    });
  }

  const mobileSlots = presentation.allRounds.flatMap((r) =>
    r.matches.map((m) => ({
      kind: (m.isPlaceholder ? "round-placeholder" : "match") as BracketSlotKind,
      card: allCards.find((c) => c.id === m.id) ?? null,
      isCenter: m.isFinal,
      matchPresentation: m,
      finalistTop:
        m.local.kind === "dependency" ? m.local.dependencyLabel ?? undefined : undefined,
      finalistBottom:
        m.visit.kind === "dependency" ? m.visit.dependencyLabel ?? undefined : undefined,
    }))
  );

  return {
    totalRondas,
    sideRound: Math.max(1, presentation.activeRonda),
    centerRound: Math.min(presentation.activeRonda + 1, totalRondas),
    columnCount: columns.length,
    centerColumnIndex: Math.max(0, columns.length - 1),
    columns,
    connectors: [],
    mobileSlots,
  };
}
