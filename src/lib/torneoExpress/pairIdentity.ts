import { formatPairDisplay } from "./standings";
import type {
  ExpectedPairSide,
  PairIdentity,
  TorneoExpressPairRow,
} from "./types";

/** Dato inválido: virtual sin etiqueta. No es un UUID ni “Jugador 1”. */
export const VIRTUAL_LABEL_MISSING_FALLBACK = "Pareja por definir";

/** Dato inválido: real a la que le falta un jugador o un nombre. */
export const REAL_PAIR_INCOMPLETE_FALLBACK = "Pareja";

export function isConsistentPairShape(
  isVirtual: boolean,
  player1Id: string | null,
  player2Id: string | null
): boolean {
  if (isVirtual) return player1Id == null && player2Id == null;
  return Boolean(player1Id) && Boolean(player2Id);
}

export function expectedSideFromIdentity(
  identity: Pick<PairIdentity, "pairId" | "player1Id" | "player2Id" | "isVirtual">
): ExpectedPairSide | null {
  if (!isConsistentPairShape(identity.isVirtual, identity.player1Id, identity.player2Id)) {
    return null;
  }
  if (identity.isVirtual) {
    return {
      pair_id: identity.pairId,
      player1_id: null,
      player2_id: null,
      is_virtual: true,
    };
  }
  return {
    pair_id: identity.pairId,
    player1_id: identity.player1Id,
    player2_id: identity.player2Id,
    is_virtual: false,
  };
}

/**
 * Label desde `pairs`. Una virtual no pasa por `players` ni por
 * `pairs_with_contact`.
 */
export function pairIdentityFromRow(
  row: TorneoExpressPairRow,
  liveNames: ReadonlyMap<string, string> = new Map()
): PairIdentity {
  const player1Id = row.player1_id;
  const player2Id = row.player2_id;

  if (row.is_virtual) {
    const label = row.virtual_label?.trim() ?? "";
    if (!label || player1Id || player2Id) {
      console.warn(
        "[torneoExpress] pareja virtual inválida:",
        row.id
      );
    }
    return {
      pairId: row.id,
      player1Id,
      player2Id,
      isVirtual: true,
      display: label || VIRTUAL_LABEL_MISSING_FALLBACK,
    };
  }

  const name1 =
    (player1Id ? liveNames.get(player1Id) : undefined) ??
    row.player1_name?.trim() ??
    "";
  const name2 =
    (player2Id ? liveNames.get(player2Id) : undefined) ??
    row.player2_name?.trim() ??
    "";

  if (!isConsistentPairShape(false, player1Id, player2Id) || !name1 || !name2) {
    console.warn("[torneoExpress] pareja real incompleta:", row.id);
    return {
      pairId: row.id,
      player1Id,
      player2Id,
      isVirtual: false,
      display: REAL_PAIR_INCOMPLETE_FALLBACK,
    };
  }

  return {
    pairId: row.id,
    player1Id,
    player2Id,
    isVirtual: false,
    display: formatPairDisplay(name1, name2),
  };
}
