import type { TorneoExpressGrupoPareja, TorneoExpressPartido } from "./types";
import { canonicalMatchupKey } from "./roundRobin";

export type RosterSlot = {
  parejaId: string;
  activa: boolean;
  parejaPreviaIds: string[];
};

export type RosterMatch = {
  id: string;
  localId: string;
  visitanteId: string;
  played: boolean;
};

export type PendingMatchup = {
  localId: string;
  visitanteId: string;
};

export function slotsFromParejas(parejas: TorneoExpressGrupoPareja[]): RosterSlot[] {
  return parejas.map((pareja) => ({
    parejaId: pareja.pareja_id,
    activa: pareja.activa !== false,
    parejaPreviaIds: pareja.pareja_previa_ids ?? [],
  }));
}

export function slotOfPair(slots: RosterSlot[], pairId: string): RosterSlot | undefined {
  return slots.find(
    (slot) => slot.parejaId === pairId || slot.parejaPreviaIds.includes(pairId)
  );
}

function playedCovers(slots: RosterSlot[], match: RosterMatch, left: string, right: string): boolean {
  if (!match.played) return false;
  const local = slotOfPair(slots, match.localId);
  const visit = slotOfPair(slots, match.visitanteId);
  if (!local || !visit || local.parejaId === visit.parejaId) return false;
  const ids = new Set([local.parejaId, visit.parejaId]);
  return ids.has(left) && ids.has(right);
}

/**
 * Cruces futuros entre parejas activas que todavía no tienen un partido jugado.
 * No usa N*(N-1)/2: un jugado histórico sigue contando aunque la pareja ya no
 * tenga ese pair id. Una plaza virtual es un slot real. Un BYE no aparece.
 */
export function requiredPendingMatchups(
  slots: RosterSlot[],
  matches: RosterMatch[]
): PendingMatchup[] {
  const active = slots.filter((slot) => slot.activa);
  const pending: PendingMatchup[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i].parejaId;
      const right = active[j].parejaId;
      const covered = matches.some((match) => playedCovers(slots, match, left, right));
      if (!covered) pending.push({ localId: left, visitanteId: right });
    }
  }
  return pending;
}

export type ReconcilePlan = {
  create: PendingMatchup[];
  dropIds: string[];
};

/** Pendientes que ya no son un cruce obligatorio se retiran. Los jugados no entran. */
export function planGroupReconcile(
  slots: RosterSlot[],
  matches: RosterMatch[]
): ReconcilePlan {
  const required = requiredPendingMatchups(slots, matches);
  const requiredKeys = new Set(
    required.map((matchup) => canonicalMatchupKey(matchup.localId, matchup.visitanteId))
  );
  const activeIds = new Set(slots.filter((slot) => slot.activa).map((slot) => slot.parejaId));
  const covered = new Set<string>();
  const dropIds: string[] = [];

  for (const match of matches) {
    if (match.played) continue;
    const key = canonicalMatchupKey(match.localId, match.visitanteId);
    const bothCurrent = activeIds.has(match.localId) && activeIds.has(match.visitanteId);
    if (bothCurrent && requiredKeys.has(key) && !covered.has(key)) {
      covered.add(key);
    } else {
      dropIds.push(match.id);
    }
  }

  return {
    create: required.filter(
      (matchup) => !covered.has(canonicalMatchupKey(matchup.localId, matchup.visitanteId))
    ),
    dropIds,
  };
}

export function remapPartidoToSlot<T extends Pick<
  TorneoExpressPartido,
  "pareja_local_id" | "pareja_visitante_id" | "ganador_id"
>>(partido: T, slots: RosterSlot[]): T {
  const current = (pairId: string) => slotOfPair(slots, pairId)?.parejaId ?? pairId;
  const ganador = partido.ganador_id;
  return {
    ...partido,
    pareja_local_id: current(partido.pareja_local_id),
    pareja_visitante_id: current(partido.pareja_visitante_id),
    ganador_id: ganador ? current(ganador) : ganador,
  };
}
