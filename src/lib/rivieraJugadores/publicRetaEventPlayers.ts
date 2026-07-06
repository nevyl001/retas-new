import type { Pair } from "../db/types";
import { supabasePublicRead } from "../supabaseClient";
import {
  pairPlayer1DisplayName,
  pairPlayer2DisplayName,
} from "../pairPlayerNames";
import {
  collectPublicPlayerRefsFromPairs,
  getPublicPlayersIdentityMap,
  publicIdentityToResolvedRating,
  type PublicPlayerIdentity,
} from "./publicPlayersIdentity";

export type RetaEventPlayerRow = {
  jugadorId: string;
  legacyPlayerId: string;
  nombre: string;
  fotoUrl?: string | null;
  rating?: number | null;
  pairId?: string | null;
  pairSlot?: 1 | 2 | null;
};

export type PublicRetaResolvedPlayer = {
  /** legacy `players.id` canónico del jugador */
  id: string;
  name: string;
  fotoUrl: string | null;
  rating: number;
  /** true cuando el jugador proviene de participaciones del evento (no snapshot de pairs) */
  fromParticipacion: boolean;
};

function indexEventPlayersByLegacyId(
  players: RetaEventPlayerRow[]
): Map<string, RetaEventPlayerRow> {
  const map = new Map<string, RetaEventPlayerRow>();
  for (const player of players) {
    const legacyId = player.legacyPlayerId.trim();
    if (!legacyId || map.has(legacyId)) continue;
    map.set(legacyId, player);
  }
  return map;
}

function scoreLegacySlotMatch(
  player: RetaEventPlayerRow,
  slotLegacyId: string
): number {
  return player.legacyPlayerId.trim() === slotLegacyId.trim() ? 100 : 0;
}

function scorePairAssignment(
  pair: Pick<Pair, "player1_id" | "player2_id">,
  playerA: RetaEventPlayerRow,
  playerB: RetaEventPlayerRow
): number {
  const direct =
    scoreLegacySlotMatch(playerA, pair.player1_id) +
    scoreLegacySlotMatch(playerB, pair.player2_id);
  const swapped =
    scoreLegacySlotMatch(playerB, pair.player1_id) +
    scoreLegacySlotMatch(playerA, pair.player2_id);
  return Math.max(direct, swapped);
}

function orderedPairAssignment(
  pair: Pick<Pair, "player1_id" | "player2_id">,
  playerA: RetaEventPlayerRow,
  playerB: RetaEventPlayerRow
): [RetaEventPlayerRow, RetaEventPlayerRow] {
  const direct =
    scoreLegacySlotMatch(playerA, pair.player1_id) +
    scoreLegacySlotMatch(playerB, pair.player2_id);
  const swapped =
    scoreLegacySlotMatch(playerB, pair.player1_id) +
    scoreLegacySlotMatch(playerA, pair.player2_id);
  return swapped > direct ? [playerB, playerA] : [playerA, playerB];
}

/**
 * Asigna 2 participantes del evento a los slots de una pareja (solo IDs).
 * `available` debe ser el pool global aún no usado en otras parejas.
 */
export function assignEventPlayersToPair(
  pair: Pick<Pair, "player1_id" | "player2_id">,
  available: RetaEventPlayerRow[]
): [RetaEventPlayerRow | null, RetaEventPlayerRow | null] {
  if (available.length === 0) {
    return [null, null];
  }

  const byLegacyId = indexEventPlayersByLegacyId(available);
  const player1 = byLegacyId.get(pair.player1_id.trim()) ?? null;
  const player2 = byLegacyId.get(pair.player2_id.trim()) ?? null;

  if (player1 && player2 && player1.jugadorId !== player2.jugadorId) {
    return [player1, player2];
  }

  const pool = available.filter(
    (player) =>
      player.jugadorId !== player1?.jugadorId &&
      player.jugadorId !== player2?.jugadorId
  );

  if (player1 && !player2) {
    if (pool.length === 0) return [player1, null];
    if (pool.length === 1) return [player1, pool[0]!];
    let best: RetaEventPlayerRow | null = null;
    let bestScore = -1;
    for (const candidate of pool) {
      const score = scoreLegacySlotMatch(candidate, pair.player2_id);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return [player1, best ?? pool[0]!];
  }

  if (!player1 && player2) {
    if (pool.length === 0) return [null, player2];
    if (pool.length === 1) return [pool[0]!, player2];
    let best: RetaEventPlayerRow | null = null;
    let bestScore = -1;
    for (const candidate of pool) {
      const score = scoreLegacySlotMatch(candidate, pair.player1_id);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return [best ?? pool[0]!, player2];
  }

  if (!player1 && !player2 && pool.length === 2) {
    const [a, b] = orderedPairAssignment(pair, pool[0]!, pool[1]!);
    return [a, b];
  }

  if (pool.length >= 2) {
    let bestA: RetaEventPlayerRow | null = null;
    let bestB: RetaEventPlayerRow | null = null;
    let bestScore = -1;

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const playerA = pool[i]!;
        const playerB = pool[j]!;
        const score = scorePairAssignment(pair, playerA, playerB);
        if (score > bestScore) {
          bestScore = score;
          [bestA, bestB] = orderedPairAssignment(pair, playerA, playerB);
        }
      }
    }

    if (bestA && bestB) {
      return [bestA, bestB];
    }
  }

  if (player1) return [player1, null];
  if (player2) return [null, player2];
  return [null, null];
}

function assignPairsFromMetadata(
  pairs: Pair[],
  eventPlayers: RetaEventPlayerRow[]
): Map<string, [RetaEventPlayerRow | null, RetaEventPlayerRow | null]> {
  const assigned = new Map<
    string,
    [RetaEventPlayerRow | null, RetaEventPlayerRow | null]
  >();

  for (const pair of pairs) {
    const inPair = eventPlayers.filter((player) => player.pairId === pair.id);
    if (inPair.length < 2) continue;

    const slot1 =
      inPair.find((player) => player.pairSlot === 1) ??
      inPair.find((player) => player.legacyPlayerId === pair.player1_id) ??
      inPair[0] ??
      null;
    const slot2 =
      inPair.find((player) => player.pairSlot === 2) ??
      inPair.find((player) => player.legacyPlayerId === pair.player2_id) ??
      inPair.find((player) => player.jugadorId !== slot1?.jugadorId) ??
      null;

    if (slot1 && slot2 && slot1.jugadorId !== slot2.jugadorId) {
      assigned.set(pair.id, [slot1, slot2]);
    }
  }

  return assigned;
}

function assignPairsByLegacyId(
  pairs: Pair[],
  eventPlayers: RetaEventPlayerRow[],
  preassigned: Map<string, [RetaEventPlayerRow | null, RetaEventPlayerRow | null]>
): Map<string, [RetaEventPlayerRow | null, RetaEventPlayerRow | null]> {
  const assigned = new Map(preassigned);
  const usedJugadorIds = new Set<string>();

  for (const slots of Array.from(assigned.values())) {
    for (const player of slots) {
      if (player) usedJugadorIds.add(player.jugadorId);
    }
  }

  const pending = pairs
    .filter((pair) => !assigned.has(pair.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const pair of pending) {
    const available = eventPlayers.filter(
      (player) => !usedJugadorIds.has(player.jugadorId)
    );
    const slots = assignEventPlayersToPair(pair, available);
    if (slots[0]) usedJugadorIds.add(slots[0].jugadorId);
    if (slots[1]) usedJugadorIds.add(slots[1].jugadorId);
    assigned.set(pair.id, slots);
  }

  return assigned;
}

function parsePairSlot(raw: unknown): 1 | 2 | null {
  const value = Number(raw);
  if (value === 1 || value === 2) return value;
  return null;
}

function ingestParticipacionRow(
  byJugadorId: Map<string, RetaEventPlayerRow>,
  row: Record<string, unknown>
): void {
  const jugadorId = String(row.jugador_id ?? "").trim();
  if (!jugadorId || byJugadorId.has(jugadorId)) return;

  const legacyPlayerId = String(
    row.canonical_legacy_player_id ?? row.legacy_player_id ?? ""
  ).trim();
  const nombre = String(row.nombre ?? "").trim() || "Jugador";
  const fotoUrl =
    typeof row.foto_url === "string" && row.foto_url.trim()
      ? row.foto_url.trim()
      : null;
  const rating =
    row.rating != null && Number.isFinite(Number(row.rating))
      ? Number(row.rating)
      : null;
  const pairId = String(row.pair_id ?? "").trim() || null;
  const pairSlot = parsePairSlot(row.pair_slot);

  byJugadorId.set(jugadorId, {
    jugadorId,
    legacyPlayerId,
    nombre,
    fotoUrl,
    rating,
    pairId,
    pairSlot,
  });
}

async function fetchRetaEventPlayersFromRpc(
  organizadorId: string,
  tournamentId: string
): Promise<RetaEventPlayerRow[]> {
  const { data, error } = await supabasePublicRead.rpc(
    "riviera_public_reta_event_players",
    {
      p_organizador_id: organizadorId,
      p_tournament_id: tournamentId,
    }
  );

  if (error) {
    if (
      !error.message?.includes("riviera_public_reta_event_players") &&
      !error.message?.includes("Could not find the function")
    ) {
      console.warn("[publicRetaEventPlayers] rpc:", error.message);
    }
    return [];
  }

  const byJugadorId = new Map<string, RetaEventPlayerRow>();
  for (const row of data ?? []) {
    ingestParticipacionRow(byJugadorId, row as Record<string, unknown>);
  }
  return Array.from(byJugadorId.values());
}

async function fetchRetaEventPlayersFromTable(
  organizadorId: string,
  tournamentId: string
): Promise<RetaEventPlayerRow[]> {
  const { data, error } = await supabasePublicRead
    .from("jugador_participaciones")
    .select(
      `
      jugador_id,
      metadata,
      riviera_jugadores!inner (
        id,
        legacy_player_id,
        nombre,
        foto_url,
        rating,
        organizador_id,
        estado
      )
    `
    )
    .eq("evento_id", tournamentId)
    .eq("tipo_evento", "reta");

  if (error) {
    console.warn("[publicRetaEventPlayers] participaciones:", error.message);
    return [];
  }

  const byJugadorId = new Map<string, RetaEventPlayerRow>();
  const org = organizadorId.trim();

  for (const row of data ?? []) {
    const rj = row.riviera_jugadores as
      | {
          id?: string;
          legacy_player_id?: string | null;
          nombre?: string | null;
          foto_url?: unknown;
          rating?: unknown;
          organizador_id?: string | null;
          estado?: string | null;
        }
      | null
      | undefined;
    if (!rj?.id) continue;
    if (String(rj.organizador_id ?? "").trim() !== org) continue;
    if (String(rj.estado ?? "") !== "activo") continue;

    const metadata = (row.metadata ?? {}) as Record<string, unknown>;

    ingestParticipacionRow(byJugadorId, {
      jugador_id: row.jugador_id ?? rj.id,
      legacy_player_id: rj.legacy_player_id,
      canonical_legacy_player_id: metadata.canonical_legacy_player_id,
      nombre: rj.nombre,
      foto_url: rj.foto_url,
      rating: rj.rating,
      pair_id: metadata.pair_id,
      pair_slot: metadata.pair_slot,
    });
  }

  return Array.from(byJugadorId.values());
}

export async function fetchRetaEventParticipacionPlayers(
  organizadorId: string,
  tournamentId: string
): Promise<RetaEventPlayerRow[]> {
  const org = organizadorId.trim();
  const eventoId = tournamentId.trim();
  if (!org || !eventoId) return [];

  const fromRpc = await fetchRetaEventPlayersFromRpc(org, eventoId);
  if (fromRpc.length > 0) return fromRpc;

  return fetchRetaEventPlayersFromTable(org, eventoId);
}

function toResolvedPlayer(
  legacyId: string,
  fallbackName: string,
  identity: PublicPlayerIdentity | undefined,
  eventRow: RetaEventPlayerRow | null
): PublicRetaResolvedPlayer {
  const name =
    eventRow?.nombre.trim() ||
    identity?.nombre.trim() ||
    fallbackName;
  const fotoUrl =
    (eventRow?.fotoUrl?.trim() || null) ??
    identity?.fotoUrl ??
    null;
  const rating = publicIdentityToResolvedRating(
    identity,
    eventRow?.rating ?? null
  );

  return {
    id: legacyId,
    name,
    fotoUrl,
    rating,
    fromParticipacion: Boolean(eventRow),
  };
}

/**
 * Resuelve jugadores de reta pública por `riviera_jugador_id` / `legacy_player_id`.
 */
export async function resolvePublicRetaTournamentPairPlayers(
  organizadorId: string,
  tournamentId: string,
  pairs: Pair[],
  _opts?: { publicOnly?: boolean }
): Promise<Record<string, PublicRetaResolvedPlayer[]>> {
  const result: Record<string, PublicRetaResolvedPlayer[]> = {};
  if (!organizadorId.trim() || pairs.length === 0) return result;

  const identityMap = await getPublicPlayersIdentityMap(
    organizadorId,
    collectPublicPlayerRefsFromPairs(pairs)
  );

  const eventPlayers = await fetchRetaEventParticipacionPlayers(
    organizadorId,
    tournamentId
  );

  const fromMetadata = assignPairsFromMetadata(pairs, eventPlayers);
  const assignedByPairId = assignPairsByLegacyId(
    pairs,
    eventPlayers,
    fromMetadata
  );

  for (const pair of pairs) {
    const assigned = assignedByPairId.get(pair.id) ?? [null, null];
    const [assigned1, assigned2] = assigned;

    const legacy1 = pair.player1_id.trim();
    const legacy2 = pair.player2_id.trim();

    const player1 = toResolvedPlayer(
      legacy1,
      pairPlayer1DisplayName(pair),
      identityMap.get(legacy1),
      assigned1
    );
    const player2 = toResolvedPlayer(
      legacy2,
      pairPlayer2DisplayName(pair),
      identityMap.get(legacy2),
      assigned2
    );

    result[pair.id] = [player1, player2];
  }

  return result;
}
