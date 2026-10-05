import type { Pair } from "../db/types";
import type { ParticipanteLadoSnapshot, ParticipantesSnapshot } from "./types";

export type RatingSide = {
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseParticipanteLado(value: unknown): ParticipanteLadoSnapshot | null {
  if (!isRecord(value) || typeof value.is_virtual !== "boolean") return null;
  return {
    player1_id: textOrNull(value.player1_id),
    player2_id: textOrNull(value.player2_id),
    player1_name: textOrNull(value.player1_name),
    player2_name: textOrNull(value.player2_name),
    is_virtual: value.is_virtual,
    virtual_label: textOrNull(value.virtual_label),
  };
}

export function parseParticipantesSnapshot(value: unknown): ParticipantesSnapshot | null {
  if (!isRecord(value)) return null;
  const local = parseParticipanteLado(value.local);
  const visitante = parseParticipanteLado(value.visitante);
  if (!local || !visitante) return null;
  return { local, visitante };
}

/** Lado real congelado. Una plaza virtual no aporta jugadores al rating. */
export function ratingSideFromSnapshot(lado: ParticipanteLadoSnapshot): RatingSide | null {
  if (lado.is_virtual || !lado.player1_id || !lado.player2_id) return null;
  return {
    player1_id: lado.player1_id,
    player2_id: lado.player2_id,
    player1_name: lado.player1_name ?? "",
    player2_name: lado.player2_name ?? "",
  };
}

/**
 * Carrera y rating leen el snapshot si existe.
 * Si no, la pareja viva: partidos anteriores a esta fase no tienen congelado.
 */
export function careerPairFromSide(
  pairId: string,
  side: ParticipanteLadoSnapshot | null | undefined,
  fallback: Pair | undefined
): Pair | undefined {
  const frozen = side ? ratingSideFromSnapshot(side) : null;
  if (!frozen) return fallback;
  return {
    id: pairId,
    tournament_id: fallback?.tournament_id ?? "",
    player1_id: frozen.player1_id,
    player2_id: frozen.player2_id,
    player1_name: frozen.player1_name,
    player2_name: frozen.player2_name,
    created_at: fallback?.created_at ?? "",
  };
}
