import {
  generateCircleRoundRobinScheduleDetailed,
  type GenerateRoundRobinOptions,
  type ScheduledRoundRobinMatch,
} from "../circleRoundRobinSchedule";
import { validateSchedule } from "../roundRobinValidate";
import type { Pair } from "../db/types";

export type ExistingMatchEdge = {
  id: string;
  pair1_id: string;
  pair2_id: string;
  round?: number | null;
  court?: number | null;
  status?: string | null;
  pair1_score?: number | null;
  pair2_score?: number | null;
};

export type MatchRoundCourtPatch = {
  id: string;
  round: number;
  court: number;
  pair1_id: string;
  pair2_id: string;
};

export type RepackPlan =
  | {
      ok: true;
      patches: MatchRoundCourtPatch[];
      schedule: ScheduledRoundRobinMatch[];
      seed: number;
      usedFallback: boolean;
    }
  | {
      ok: false;
      error: string;
      details?: string[];
    };

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Planifica reasignación de round/court sobre los 28 partidos existentes.
 * Conserva IDs. No escribe a Supabase.
 */
export function planRepackExistingRoundRobin(
  pairs: Pair[],
  existingMatches: ExistingMatchEdge[],
  courts: number,
  options?: GenerateRoundRobinOptions
): RepackPlan {
  const n = pairs.length;
  const expected = (n * (n - 1)) / 2;
  if (n < 2) {
    return { ok: false, error: "Se necesitan al menos 2 parejas." };
  }
  if (existingMatches.length !== expected) {
    return {
      ok: false,
      error: `Se esperaban ${expected} partidos; hay ${existingMatches.length}. Detener reparación.`,
    };
  }

  const byEdge = new Map<string, ExistingMatchEdge>();
  for (const m of existingMatches) {
    if (!m.pair1_id || !m.pair2_id || m.pair1_id === m.pair2_id) {
      return {
        ok: false,
        error: `Partido inválido ${m.id}: parejas mal formadas.`,
      };
    }
    const key = edgeKey(m.pair1_id, m.pair2_id);
    if (byEdge.has(key)) {
      return {
        ok: false,
        error: `Enfrentamiento duplicado ${key}. Detener reparación.`,
        details: [byEdge.get(key)!.id, m.id],
      };
    }
    byEdge.set(key, m);
  }

  if (byEdge.size !== expected) {
    return {
      ok: false,
      error: `Hay enfrentamientos faltantes o duplicados (${byEdge.size}/${expected}).`,
    };
  }

  const pairIds = new Set(pairs.map((p) => p.id));
  for (const m of existingMatches) {
    if (!pairIds.has(m.pair1_id) || !pairIds.has(m.pair2_id)) {
      return {
        ok: false,
        error: `El partido ${m.id} referencia parejas ajenas al torneo.`,
      };
    }
  }

  const detailed = generateCircleRoundRobinScheduleDetailed(
    pairs,
    courts,
    options
  );
  const schedule = detailed.schedule;
  const usedFallback = detailed.usedFallback;
  const detailedSeed = detailed.seed;

  const errors = validateSchedule(
    schedule.map((m) => ({
      pair1Id: m.pair1.id,
      pair2Id: m.pair2.id,
      round: m.round,
      court: m.court,
    })),
    pairs,
    courts
  );
  if (errors.length > 0) {
    return {
      ok: false,
      error: "El calendario generado no pasó validateSchedule.",
      details: errors,
    };
  }

  const patches: MatchRoundCourtPatch[] = [];
  const usedMatchIds = new Set<string>();

  for (const slot of schedule) {
    const key = edgeKey(slot.pair1.id, slot.pair2.id);
    const existing = byEdge.get(key);
    if (!existing) {
      return {
        ok: false,
        error: `Falta el enfrentamiento ${key} entre los partidos existentes.`,
      };
    }
    if (usedMatchIds.has(existing.id)) {
      return {
        ok: false,
        error: `El partido ${existing.id} se mapearía dos veces.`,
      };
    }
    usedMatchIds.add(existing.id);
    patches.push({
      id: existing.id,
      round: slot.round,
      court: slot.court,
      pair1_id: existing.pair1_id,
      pair2_id: existing.pair2_id,
    });
  }

  if (patches.length !== expected || usedMatchIds.size !== expected) {
    return {
      ok: false,
      error: "El mapeo no cubrió exactamente todos los partidos existentes.",
    };
  }

  const remappedErrors = validateSchedule(
    patches.map((p) => ({
      pair1Id: p.pair1_id,
      pair2Id: p.pair2_id,
      round: p.round,
      court: p.court,
    })),
    pairs,
    courts
  );
  if (remappedErrors.length > 0) {
    return {
      ok: false,
      error: "La distribución remapeada es inválida.",
      details: remappedErrors,
    };
  }

  return {
    ok: true,
    patches,
    schedule,
    seed: detailedSeed,
    usedFallback,
  };
}
