export type CategoriaParejaSlots = {
  parejaId: string;
  player1Id: string;
  player2Id: string;
};

export type CategoriaPairGuardCode =
  | "PLAYER_ALREADY_REGISTERED"
  | "OUTGOING_NOT_IN_PAIR"
  | "NEW_IS_PARTNER"
  | "MISSING_PLAYER_NAME"
  | "PLAYER_NOT_LINKED"
  | "PAIR_TOURNAMENT_UNRESOLVED";

export type PairPlayerSlots = {
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
};

export type ReplacedPairPlayer =
  | {
      ok: true;
      slot: "player1" | "player2";
      pair: PairPlayerSlots;
    }
  | { ok: false; code: CategoriaPairGuardCode };

/**
 * El jugador ya ocupa un slot en otra pareja vinculada a esta categoría.
 * `excludeParejaId` deja fuera la pareja que se está editando.
 * No consulta otras categorías: el caller solo pasa las parejas de esta.
 */
export function jugadorYaInscritoEnCategoria(
  parejas: CategoriaParejaSlots[],
  playerId: string,
  excludeParejaId?: string
): boolean {
  const id = playerId.trim();
  if (!id) return false;
  const excluded = excludeParejaId?.trim() ?? "";
  return parejas.some((pareja) => {
    if (excluded && pareja.parejaId === excluded) return false;
    return pareja.player1Id === id || pareja.player2Id === id;
  });
}

/**
 * Convierte el jugador de Riviera al id de `players` que exige `pairs`.
 * Sin `legacyPlayerId` no hay id usable, aunque exista el id Riviera.
 */
export function resolvePlayersIdForPair(input: {
  rivieraJugadorId?: string | null;
  legacyPlayerId?: string | null;
}): { ok: true; playersId: string } | { ok: false; code: "PLAYER_NOT_LINKED" } {
  const legacy = input.legacyPlayerId?.trim() ?? "";
  if (!legacy) return { ok: false, code: "PLAYER_NOT_LINKED" };
  return { ok: true, playersId: legacy };
}

export function replacePairPlayerSlot(input: {
  pair: PairPlayerSlots;
  outgoingPlayerId: string;
  incomingPlayerId: string;
  incomingName: string;
}): ReplacedPairPlayer {
  const outgoing = input.outgoingPlayerId.trim();
  const incoming = input.incomingPlayerId.trim();
  const incomingName = input.incomingName.trim();
  const pair = input.pair;

  const slot =
    pair.player1Id === outgoing
      ? "player1"
      : pair.player2Id === outgoing
        ? "player2"
        : null;
  if (!slot) return { ok: false, code: "OUTGOING_NOT_IN_PAIR" };

  const partnerId = slot === "player1" ? pair.player2Id : pair.player1Id;
  if (!incoming || incoming === partnerId || incoming === outgoing) {
    return { ok: false, code: "NEW_IS_PARTNER" };
  }
  if (!incomingName) return { ok: false, code: "MISSING_PLAYER_NAME" };

  if (slot === "player1") {
    return {
      ok: true,
      slot,
      pair: {
        ...pair,
        player1Id: incoming,
        player1Name: incomingName,
      },
    };
  }

  return {
    ok: true,
    slot,
    pair: {
      ...pair,
      player2Id: incoming,
      player2Name: incomingName,
    },
  };
}

export type PairTournamentRef = {
  parejaId: string;
  tournamentId: string | null;
};

/**
 * Un solo `pairs.tournament_id` compartido por las parejas ya vinculadas.
 * Vacío, nulo o varios ids distintos abortan sin inventar un torneo nuevo.
 */
export function resolveCategoriaPairTournamentId(
  parejas: PairTournamentRef[]
): { ok: true; tournamentId: string } | { ok: false; code: "PAIR_TOURNAMENT_UNRESOLVED" } {
  if (parejas.length === 0) {
    return { ok: false, code: "PAIR_TOURNAMENT_UNRESOLVED" };
  }

  const ids = new Set<string>();
  for (const pareja of parejas) {
    const tournamentId = pareja.tournamentId?.trim() ?? "";
    if (!tournamentId) {
      return { ok: false, code: "PAIR_TOURNAMENT_UNRESOLVED" };
    }
    ids.add(tournamentId);
  }

  if (ids.size !== 1) {
    return { ok: false, code: "PAIR_TOURNAMENT_UNRESOLVED" };
  }

  return { ok: true, tournamentId: Array.from(ids)[0]! };
}
