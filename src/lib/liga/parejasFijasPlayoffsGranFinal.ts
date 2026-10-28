/**
 * Resolución de ganadores de semifinales y plan de sincronización de la Gran Final.
 * El ranking/sembrado solo define SF1/SF2; la FINAL solo usa ganadores del marcador.
 */

import {
  computePlayoffsMatchPoints,
  parsePlayoffsSetScoresJson,
  type PlayoffsSetScoresPayload,
} from "./parejasFijasPlayoffsMatchScore";
import { buildGranFinalCross } from "./parejasFijasPlayoffsBracket";

export type PlayoffsSemifinalRowInput = {
  bracket_slot: "SF1" | "SF2" | string;
  estado: string;
  pareja1_equipo_id: string;
  pareja2_equipo_id: string;
  score_pareja1: number | null;
  score_pareja2: number | null;
  set_scores: unknown;
};

export type PlayoffsSemifinalWinner = {
  slot: "SF1" | "SF2";
  winnerEquipoId: string;
  loserEquipoId: string;
  viaStb: boolean;
};

export type ResolveSemifinalWinnersResult =
  | { ok: true; winners: [PlayoffsSemifinalWinner, PlayoffsSemifinalWinner] }
  | { ok: false; error: string };

/** Ganador de un partido de playoffs a partir del marcador persistido (sets + STB/set3). */
export function resolvePlayoffsMatchWinnerEquipoId(
  pareja1EquipoId: string,
  pareja2EquipoId: string,
  scorePareja1: number | null,
  scorePareja2: number | null,
  setScores: unknown
):
  | {
      ok: true;
      winnerEquipoId: string;
      loserEquipoId: string;
      viaStb: boolean;
      payload: PlayoffsSetScoresPayload;
    }
  | { ok: false; error: string } {
  const payload = parsePlayoffsSetScoresJson(setScores);
  const s1 = Number(scorePareja1);
  const s2 = Number(scorePareja2);
  if (!payload || !Number.isFinite(s1) || !Number.isFinite(s2)) {
    return { ok: false, error: "Marcador incompleto." };
  }
  const pts = computePlayoffsMatchPoints(s1, s2, payload);
  if (!pts.ok) {
    return { ok: false, error: pts.error };
  }
  const winnerEquipoId = pts.result.p1Won
    ? pareja1EquipoId
    : pareja2EquipoId;
  const loserEquipoId = pts.result.p1Won
    ? pareja2EquipoId
    : pareja1EquipoId;
  return {
    ok: true,
    winnerEquipoId,
    loserEquipoId,
    viaStb: Boolean(pts.result.viaStb),
    payload,
  };
}

/** Resuelve ganadores de SF1 y SF2; no usa ranking ni seeds. */
export function resolvePlayoffsSemifinalWinners(
  rows: readonly PlayoffsSemifinalRowInput[]
): ResolveSemifinalWinnersResult {
  const winners: PlayoffsSemifinalWinner[] = [];
  for (const slot of ["SF1", "SF2"] as const) {
    const row = rows.find((r) => r.bracket_slot === slot);
    if (!row) {
      return { ok: false, error: `Falta partido ${slot}.` };
    }
    if (row.estado !== "completed") {
      return { ok: false, error: `${slot} no está completed.` };
    }
    const resolved = resolvePlayoffsMatchWinnerEquipoId(
      row.pareja1_equipo_id,
      row.pareja2_equipo_id,
      row.score_pareja1,
      row.score_pareja2,
      row.set_scores
    );
    if (!resolved.ok) {
      return { ok: false, error: `${slot}: ${resolved.error}` };
    }
    winners.push({
      slot,
      winnerEquipoId: resolved.winnerEquipoId,
      loserEquipoId: resolved.loserEquipoId,
      viaStb: resolved.viaStb,
    });
  }
  return {
    ok: true,
    winners: [winners[0]!, winners[1]!],
  };
}

export type ExistingFinalSnapshot = {
  id: string;
  equipo1_id: string;
  equipo2_id: string;
  estado: string;
  score_pareja1: number | null;
  score_pareja2: number | null;
  set_scores: unknown;
};

export type GranFinalSyncPlan =
  | { action: "noop"; reason: string }
  | {
      action: "create";
      equipo1_id: string;
      equipo2_id: string;
    }
  | {
      action: "update_unscored";
      finalId: string;
      equipo1_id: string;
      equipo2_id: string;
      previousEquipo1_id: string;
      previousEquipo2_id: string;
    }
  | {
      action: "blocked_scored_mismatch";
      finalId: string;
      expectedEquipo1_id: string;
      expectedEquipo2_id: string;
      actualEquipo1_id: string;
      actualEquipo2_id: string;
    };

function sameFinalPair(
  a1: string,
  a2: string,
  b1: string,
  b2: string
): boolean {
  return (
    (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1)
  );
}

function finalHasResult(final: ExistingFinalSnapshot): boolean {
  if (final.estado === "completed") return true;
  if (final.score_pareja1 != null || final.score_pareja2 != null) return true;
  if (final.set_scores != null) return true;
  return false;
}

/**
 * Plan idempotente: crear FINAL, o actualizar si aún no tiene marcador.
 * Nunca clasifica por seed/ranking; solo por ganadores de SF.
 */
export function planGranFinalSync(
  winners: readonly [PlayoffsSemifinalWinner, PlayoffsSemifinalWinner],
  existingFinal: ExistingFinalSnapshot | null
): GranFinalSyncPlan {
  const cross = buildGranFinalCross(
    winners[0]!.winnerEquipoId,
    winners[1]!.winnerEquipoId
  );
  const expected1 = cross.equipo1_id;
  const expected2 = cross.equipo2_id;

  if (!existingFinal) {
    return {
      action: "create",
      equipo1_id: expected1,
      equipo2_id: expected2,
    };
  }

  if (
    sameFinalPair(
      existingFinal.equipo1_id,
      existingFinal.equipo2_id,
      expected1,
      expected2
    )
  ) {
    return { action: "noop", reason: "FINAL already matches SF winners." };
  }

  if (finalHasResult(existingFinal)) {
    return {
      action: "blocked_scored_mismatch",
      finalId: existingFinal.id,
      expectedEquipo1_id: expected1,
      expectedEquipo2_id: expected2,
      actualEquipo1_id: existingFinal.equipo1_id,
      actualEquipo2_id: existingFinal.equipo2_id,
    };
  }

  return {
    action: "update_unscored",
    finalId: existingFinal.id,
    equipo1_id: expected1,
    equipo2_id: expected2,
    previousEquipo1_id: existingFinal.equipo1_id,
    previousEquipo2_id: existingFinal.equipo2_id,
  };
}
