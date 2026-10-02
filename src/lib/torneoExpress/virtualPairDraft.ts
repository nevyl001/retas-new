import { formatPairDisplay } from "./standings";
import type { Player } from "../database";

/** Pareja con dos jugadores. El id es el de `pairs`. */
export type RealDraftPair = {
  kind: "real";
  id: string;
  jugador1: Player;
  jugador2: Player;
};

/** Plaza sin jugadores. El id es el de `pairs`, no un id de jugador. */
export type VirtualDraftPair = {
  kind: "virtual";
  id: string;
  virtualLabel: string;
};

export type DraftTournamentPair = RealDraftPair | VirtualDraftPair;

export function isRealDraftPair(pair: DraftTournamentPair): pair is RealDraftPair {
  return pair.kind === "real";
}

export function isVirtualDraftPair(pair: DraftTournamentPair): pair is VirtualDraftPair {
  return pair.kind === "virtual";
}

/** Misma escala que los nombres de grupo en Torneo Express. */
export const VIRTUAL_PAIR_LABEL_MAX = 80;

export const VIRTUAL_PAIR_BADGE = "POR DEFINIR";

export function normalizeVirtualPairLabel(raw: string): string | null {
  const label = raw.trim();
  if (!label || label.length > VIRTUAL_PAIR_LABEL_MAX) return null;
  return label;
}

/** El siguiente “Pareja por definir N” que no esté ya usado en el borrador. */
export function nextVirtualPairLabel(existingLabels: readonly string[]): string {
  const used = new Set(existingLabels.map((label) => label.trim()));
  let n = 1;
  let candidate = `Pareja por definir ${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `Pareja por definir ${n}`;
  }
  return candidate;
}

export function draftPairDisplay(pair: DraftTournamentPair): string {
  if (pair.kind === "virtual") return pair.virtualLabel;
  return formatPairDisplay(pair.jugador1.name, pair.jugador2.name);
}
