/**
 * Wrappers cliente de los RPC de `0010_dynamic_team_lineup_blocks.sql`.
 * Capa separada de `database.ts` a propósito (ver plan de "Equipos con
 * alineación dinámica") -- mismo estilo que `applyRetaMatchUpdate` (lock +
 * idempotencia + conflicto explícito vía discriminated union), pero
 * exclusiva de esta variante opcional.
 */
import { supabase } from "../supabaseClient";
import type { DynamicLineupBlockPlan, DynamicStage } from "./dynamicTeamLineups";

export type BeginDynamicTeamBlockResult =
  | { status: "claimed"; blockId: string }
  | { status: "already_claimed" }
  | { status: "previous_block_not_completed" }
  | { status: "tournament_finished" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Reclama el `block_number` para generarlo. Si `already_claimed`, otro
 * clic/pestaña/poll ya lo generó o lo está generando -- el llamador debe
 * releer el estado (no reintentar automáticamente).
 */
export async function beginDynamicTeamBlock(params: {
  tournamentId: string;
  blockNumber: number;
  roundStart: number;
  roundEnd: number;
  stage: DynamicStage;
}): Promise<BeginDynamicTeamBlockResult> {
  const { data, error } = await supabase.rpc("begin_dynamic_team_block", {
    p_tournament_id: params.tournamentId,
    p_block_number: params.blockNumber,
    p_round_start: params.roundStart,
    p_round_end: params.roundEnd,
    p_stage: params.stage,
  });

  if (error) {
    console.error("[begin_dynamic_team_block]", {
      code: (error as { code?: string }).code,
      message: error.message,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
      payload: {
        p_tournament_id: params.tournamentId,
        p_block_number: params.blockNumber,
        p_round_start: params.roundStart,
        p_round_end: params.roundEnd,
        p_stage: params.stage,
      },
    });
    return { status: "error", message: error.message };
  }

  const result = data as { ok: boolean; error?: string; block_id?: string } | null;
  if (!result) return { status: "error", message: "Respuesta inválida del servidor." };

  if (!result.ok) {
    if (result.error === "already_claimed") return { status: "already_claimed" };
    if (result.error === "previous_block_not_completed")
      return { status: "previous_block_not_completed" };
    if (result.error === "tournament_finished") return { status: "tournament_finished" };
    if (result.error === "not_found") return { status: "not_found" };
    return { status: "error", message: result.error ?? "No se pudo reservar el bloque." };
  }

  return { status: "claimed", blockId: result.block_id ?? "" };
}

export type CommitDynamicTeamBlockResult =
  | { status: "completed" | "unchanged" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Confirma un bloque previamente reclamado con `beginDynamicTeamBlock`:
 * persiste la fotografía de alineaciones (`teams`) y mergea las parejas
 * nuevas dentro de `tournaments.team_config.pairToTeam`.
 */
export async function commitDynamicTeamBlock(params: {
  blockId: string;
  teams: DynamicLineupBlockPlan["teamA"][];
  pairToTeamDelta: Record<string, number>;
}): Promise<CommitDynamicTeamBlockResult> {
  const { data, error } = await supabase.rpc("commit_dynamic_team_block", {
    p_block_id: params.blockId,
    p_teams: params.teams,
    p_pair_to_team_delta: params.pairToTeamDelta,
  });

  if (error) return { status: "error", message: error.message };

  const result = data as { ok: boolean; error?: string; status?: string } | null;
  if (!result) return { status: "error", message: "Respuesta inválida del servidor." };

  if (!result.ok) {
    if (result.error === "not_found") return { status: "not_found" };
    return { status: "error", message: result.error ?? "No se pudo confirmar el bloque." };
  }

  return { status: result.status === "unchanged" ? "unchanged" : "completed" };
}

export type RetryDynamicTeamBlockResult =
  | { status: "released" }
  | { status: "already_completed" }
  | { status: "matches_exist" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Recuperación administrativa: libera un `block_number` sin partidos en su
 * rango (generating o completed huérfano, p.ej. tras reset). Nunca borra un
 * bloque que todavía tiene partidos reales.
 */
export async function retryDynamicTeamBlock(params: {
  tournamentId: string;
  blockNumber: number;
}): Promise<RetryDynamicTeamBlockResult> {
  const { data, error } = await supabase.rpc("retry_dynamic_team_block", {
    p_tournament_id: params.tournamentId,
    p_block_number: params.blockNumber,
  });

  if (error) return { status: "error", message: error.message };

  const result = data as { ok: boolean; error?: string } | null;
  if (!result) return { status: "error", message: "Respuesta inválida del servidor." };

  if (!result.ok) {
    if (result.error === "already_completed") return { status: "already_completed" };
    if (result.error === "matches_exist") return { status: "matches_exist" };
    if (result.error === "not_found") return { status: "not_found" };
    return { status: "error", message: result.error ?? "No se pudo liberar el bloque." };
  }

  return { status: "released" };
}

export interface RetaDynamicBlockRow {
  id: string;
  tournament_id: string;
  block_number: number;
  round_start: number;
  round_end: number;
  status: "generating" | "completed";
  stage: DynamicStage;
  teams: DynamicLineupBlockPlan["teamA"][];
  generated_at: string | null;
  created_at: string;
}

/** Lectura simple (RLS ya filtra por dueño o visibilidad pública). */
export async function getDynamicTeamBlocks(
  tournamentId: string
): Promise<RetaDynamicBlockRow[]> {
  const { data, error } = await supabase
    .from("reta_dynamic_blocks")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("block_number", { ascending: true });

  if (error) {
    console.error("[dynamic-team-blocks] getDynamicTeamBlocks:", error);
    return [];
  }
  return (data ?? []) as RetaDynamicBlockRow[];
}
