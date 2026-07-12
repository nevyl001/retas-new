import { isValidUuid } from "./db/schemaHelpers";

/**
 * Columnas reales de `public.pairs` (sin `user_id`: no existe en schema prod;
 * el ownership se valida vía tournament_id / RLS is_tournament_owner).
 */
export type CreatePairInsertPayload = {
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
};

export type BuildCreatePairPayloadResult =
  | { ok: true; payload: CreatePairInsertPayload }
  | { ok: false; error: string };

export function buildCreatePairPayload(input: {
  tournamentId?: string | null;
  player1Id?: string | null;
  player2Id?: string | null;
  player1Name?: string | null;
  player2Name?: string | null;
}): BuildCreatePairPayloadResult {
  const tournamentId = input.tournamentId?.trim() ?? "";
  const player1Id = input.player1Id?.trim() ?? "";
  const player2Id = input.player2Id?.trim() ?? "";
  const player1Name = input.player1Name?.trim() ?? "";
  const player2Name = input.player2Name?.trim() ?? "";

  if (!tournamentId || !isValidUuid(tournamentId)) {
    return { ok: false, error: "Falta tournament_id válido" };
  }
  if (!player1Id || !isValidUuid(player1Id)) {
    return { ok: false, error: "Falta player1_id válido" };
  }
  if (!player2Id || !isValidUuid(player2Id)) {
    return { ok: false, error: "Falta player2_id válido" };
  }
  if (player1Id === player2Id) {
    return { ok: false, error: "No puedes emparejar un jugador consigo mismo" };
  }
  if (!player1Name || !player2Name) {
    return { ok: false, error: "Faltan nombres de jugadores" };
  }

  const payload: CreatePairInsertPayload = {
    tournament_id: tournamentId,
    player1_id: player1Id,
    player2_id: player2Id,
    player1_name: player1Name,
    player2_name: player2Name,
  };

  // Defensa: nunca incluir user_id u otras claves UI/legacy
  if ("user_id" in (payload as object)) {
    return { ok: false, error: "Payload inválido" };
  }
  if (Object.values(payload).some((v) => v === undefined || v === null)) {
    return { ok: false, error: "Payload contiene valores vacíos" };
  }

  return { ok: true, payload };
}

export const PAIR_SELECT_WITH_PLAYERS = `
  *,
  player1:players!player1_id(*),
  player2:players!player2_id(*)
`;
