/**
 * Reglas de edición segura de configuración de reta (Round Robin / equipos).
 * Puro: sin I/O. No inventa columnas.
 */

export type RetaEditPhase =
  | "draft"
  | "pairs_only"
  | "in_play"
  | "finished";

export type RetaConfigFieldKey =
  | "name"
  | "description"
  | "courts"
  | "championship"
  | "lugar"
  | "mostrar_lugar"
  | "cancha"
  | "programado_en"
  | "programado_hasta"
  | "duration_minutes";

/** Representación canónica de “Por asignar” cuando el esquema permite NULL. */
export const UNASSIGNED_COURT: null = null;

export function deriveRetaEditPhase(input: {
  is_started: boolean;
  is_finished: boolean;
  pairsCount: number;
  matchesCount: number;
}): RetaEditPhase {
  if (input.is_finished) return "finished";
  if (input.matchesCount > 0 || input.is_started) return "in_play";
  if (input.pairsCount > 0) return "pairs_only";
  return "draft";
}

export type FieldEditability = {
  editable: boolean;
  reason?: string;
};

const ALL_EDITABLE: FieldEditability = { editable: true };

export function fieldEditability(
  field: RetaConfigFieldKey,
  phase: RetaEditPhase
): FieldEditability {
  if (phase === "draft" || phase === "pairs_only") {
    return ALL_EDITABLE;
  }

  if (phase === "finished") {
    const editorial: RetaConfigFieldKey[] = [
      "name",
      "description",
      "lugar",
      "mostrar_lugar",
      "cancha",
      "programado_en",
      "programado_hasta",
      "duration_minutes",
    ];
    if (editorial.includes(field)) return ALL_EDITABLE;
    if (field === "courts" || field === "championship") {
      return {
        editable: false,
        reason:
          "La reta está finalizada: no se pueden cambiar canchas ni Remontada Final (alteraría el historial).",
      };
    }
  }

  if (field === "championship") {
    return {
      editable: false,
      reason:
        "Hay partidos generados: no se puede activar/desactivar Remontada Final sin regenerar el fixture (no automático).",
    };
  }
  if (field === "courts") {
    return {
      editable: true,
      reason:
        "Reducir canchas no borra partidos. Los pendientes en canchas que dejen de existir quedarán «Por asignar» (sin reasignación automática).",
    };
  }
  return ALL_EDITABLE;
}

export function matchHasResult(match: {
  status?: string | null;
  pair1_score?: number | null;
  pair2_score?: number | null;
}): boolean {
  const s = (match.status || "").toLowerCase();
  if (s === "completed" || s === "finished" || s === "finalizado") return true;
  if (match.pair1_score != null || match.pair2_score != null) return true;
  return false;
}

export function matchIsInProgress(match: {
  status?: string | null;
}): boolean {
  const s = (match.status || "").toLowerCase();
  return (
    s === "in_progress" ||
    s === "playing" ||
    s === "en_juego" ||
    s === "live" ||
    s === "started"
  );
}

/** Elegibles para desasignar al reducir canchas. */
export function matchesEligibleForCourtUnassign<
  T extends {
    court: number | null;
    status?: string | null;
    pair1_score?: number | null;
    pair2_score?: number | null;
  }
>(matches: readonly T[], newCourts: number): T[] {
  const n = Math.max(1, Math.floor(newCourts) || 1);
  return matches.filter((m) => {
    if (m.court == null || m.court <= 0) return false;
    if (m.court <= n) return false;
    if (matchHasResult(m) || matchIsInProgress(m)) return false;
    return true;
  });
}

/** @deprecated alias — usar matchesEligibleForCourtUnassign */
export function pendingMatchesOnRemovedCourts<
  T extends {
    court: number | null;
    status?: string | null;
    pair1_score?: number | null;
    pair2_score?: number | null;
  }
>(matches: readonly T[], newCourts: number): T[] {
  return matchesEligibleForCourtUnassign(matches, newCourts);
}

export type CourtsChangePlan =
  | { kind: "noop" }
  | { kind: "increase"; newCourts: number }
  | {
      kind: "decrease";
      newCourts: number;
      affectedPendingCount: number;
      confirmationMessage: string;
    };

export function planCourtsChange(input: {
  currentCourts: number;
  nextCourts: number;
  matches: readonly {
    court: number | null;
    status?: string | null;
    pair1_score?: number | null;
    pair2_score?: number | null;
  }[];
}): CourtsChangePlan {
  const current = Math.max(1, Math.floor(input.currentCourts) || 1);
  const next = Math.max(1, Math.min(20, Math.floor(input.nextCourts) || 1));
  if (next === current) return { kind: "noop" };
  if (next > current) return { kind: "increase", newCourts: next };

  const affected = matchesEligibleForCourtUnassign(input.matches, next);
  return {
    kind: "decrease",
    newCourts: next,
    affectedPendingCount: affected.length,
    confirmationMessage:
      affected.length === 0
        ? `Reducir de ${current} a ${next} canchas. No hay partidos pendientes en canchas que dejen de existir. Los partidos iniciados, terminados y sus resultados no se modificarán.`
        : `Reducir de ${current} a ${next} canchas dejará ${affected.length} partido(s) pendiente(s) sin cancha asignada. Los partidos iniciados, terminados y sus resultados no se modificarán.`,
  };
}

/**
 * Prefiere championship_config de BD sobre localStorage para una reta existente.
 * Usado en tests de divergencia (puro).
 */
export function preferDbChampionshipOverLocal(input: {
  db: { championshipEnabled: boolean; championshipRounds: number } | null;
  local: { championshipEnabled: boolean; championshipRounds: number } | null;
}): { championshipEnabled: boolean; championshipRounds: number } {
  if (input.db) {
    return {
      championshipEnabled: input.db.championshipEnabled,
      championshipRounds: input.db.championshipRounds,
    };
  }
  // Sin fila en BD: no activar por localStorage solo
  return {
    championshipEnabled: false,
    championshipRounds: input.local?.championshipRounds ?? 2,
  };
}
