import type { Match, RetaMatchSetInput } from "../database";

export type RetaScoreSaveMode = "finish" | "correct";

export type RetaScoreSavePlan =
  | { ok: true; sets: RetaMatchSetInput[] }
  | { ok: false; error: string };

/**
 * 0–0 es un marcador real. Guardarlo deja el partido en su cancha y ronda.
 * Tratarlo como “vacío” hacía que el cruce siguiera pendiente y un reacomodo
 * de descansos pudiera sacarlo de la ronda.
 */
export function planRetaScoreSave(params: {
  score1: number;
  score2: number;
  existingSets: RetaMatchSetInput[];
  mode: RetaScoreSaveMode;
}): RetaScoreSavePlan {
  const { score1, score2, existingSets, mode } = params;
  if (!Number.isFinite(score1) || !Number.isFinite(score2)) {
    return { ok: false, error: "Ingresa el marcador de cada pareja" };
  }

  const next: RetaMatchSetInput = {
    pair1_games: score1,
    pair2_games: score2,
    is_tie_break: false,
    tie_break_pair1_points: 0,
    tie_break_pair2_points: 0,
  };

  if (mode === "correct") {
    return { ok: true, sets: [next] };
  }

  return { ok: true, sets: [...existingSets, next] };
}

/** El partido sigue en la misma cancha y ronda, sin marcador. */
export function matchAfterResultCleared<T extends Match>(match: T): T {
  return {
    ...match,
    status: "pending",
    pair1_score: undefined,
    pair2_score: undefined,
  };
}
