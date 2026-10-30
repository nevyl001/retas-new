import type { Match, Pair } from "../db/types";
import { pairPlayersDisplayLabel } from "../pairPlayerNames";
import type { TeamConfigLike } from "../teamConfigDisplay";
import { getPairTeamIndex } from "../teamConfigDisplay";

export type RestingPairSwapSlot = {
  matchId: string;
  side: "pair1" | "pair2";
  playingPairId: string;
  court: number | null;
  round: number | null;
};

export type RestingPairSwapPlan = {
  matchId: string;
  side: "pair1" | "pair2";
  restingPairId: string;
  playingPairId: string;
  updates: Pick<
    Match,
    "pair1_id" | "pair2_id" | "pair1_name" | "pair2_name"
  >;
};

function isMatchLocked(match: Match): boolean {
  if (match.status === "finished") return true;
  if (match.match_type === "championship") return true;
  if (
    typeof match.pair1_score === "number" ||
    typeof match.pair2_score === "number"
  ) {
    return true;
  }
  return false;
}

function pairLabel(pair: Pair | undefined, fallbackId: string): string {
  if (!pair) return fallbackId;
  return pairPlayersDisplayLabel(pair);
}

/**
 * Parejas jugando en la ronda que se pueden intercambiar con una que descansa
 * (partido no finalizado / sin marcador / no championship).
 */
export function listSwappablePlayingSlots(params: {
  roundMatches: Match[];
  restingPairId: string;
  pairs: Pair[];
  teamConfig?: TeamConfigLike | null;
}): RestingPairSwapSlot[] {
  const { roundMatches, restingPairId, pairs, teamConfig } = params;
  const restingTeam = getPairTeamIndex(
    restingPairId,
    teamConfig,
    pairs.find((p) => p.id === restingPairId) ?? null
  );
  const restrictTeam = restingTeam != null && Boolean(teamConfig?.teamNames?.length);

  const slots: RestingPairSwapSlot[] = [];
  for (const match of roundMatches) {
    if (isMatchLocked(match)) continue;
    const candidates: Array<{ side: "pair1" | "pair2"; id: string }> = [
      { side: "pair1", id: match.pair1_id },
      { side: "pair2", id: match.pair2_id },
    ];
    for (const c of candidates) {
      if (!c.id || c.id === restingPairId) continue;
      if (restrictTeam) {
        const playingTeam = getPairTeamIndex(
          c.id,
          teamConfig,
          pairs.find((p) => p.id === c.id) ?? null
        );
        if (playingTeam !== restingTeam) continue;
      }
      slots.push({
        matchId: match.id,
        side: c.side,
        playingPairId: c.id,
        court: match.court ?? null,
        round: match.round ?? null,
      });
    }
  }
  return slots;
}

/**
 * Plan para meter a `restingPairId` en el partido, sacando a `playingPairId`.
 */
export function planRestingPairSwap(params: {
  roundMatches: Match[];
  restingPairId: string;
  playingPairId: string;
  pairs: Pair[];
  teamConfig?: TeamConfigLike | null;
}): RestingPairSwapPlan | { error: string } {
  const { roundMatches, restingPairId, playingPairId, pairs, teamConfig } =
    params;

  if (!restingPairId || !playingPairId) {
    return { error: "Selecciona las dos parejas." };
  }
  if (restingPairId === playingPairId) {
    return { error: "Elige una pareja distinta a la que descansa." };
  }

  const restingAlreadyPlaying = roundMatches.some(
    (m) => m.pair1_id === restingPairId || m.pair2_id === restingPairId
  );
  if (restingAlreadyPlaying) {
    return { error: "Esa pareja ya juega en esta ronda." };
  }

  const slots = listSwappablePlayingSlots({
    roundMatches,
    restingPairId,
    pairs,
    teamConfig,
  });
  const slot = slots.find((s) => s.playingPairId === playingPairId);
  if (!slot) {
    const locked = roundMatches.find(
      (m) => m.pair1_id === playingPairId || m.pair2_id === playingPairId
    );
    if (!locked) {
      return { error: "Esa pareja no juega en esta ronda." };
    }
    if (isMatchLocked(locked)) {
      return {
        error:
          "No se puede mover una pareja de un partido ya jugado o de remontada.",
      };
    }
    return {
      error:
        "En modo equipos solo puedes intercambiar con una pareja del mismo equipo.",
    };
  }

  const match = roundMatches.find((m) => m.id === slot.matchId);
  if (!match) {
    return { error: "No se encontró el partido." };
  }

  const restingPair = pairs.find((p) => p.id === restingPairId);
  const restingName = pairLabel(restingPair, restingPairId);

  const updates: RestingPairSwapPlan["updates"] = {
    pair1_id: match.pair1_id,
    pair2_id: match.pair2_id,
    pair1_name: match.pair1_name,
    pair2_name: match.pair2_name,
  };

  if (slot.side === "pair1") {
    updates.pair1_id = restingPairId;
    updates.pair1_name = restingName;
  } else {
    updates.pair2_id = restingPairId;
    updates.pair2_name = restingName;
  }

  return {
    matchId: match.id,
    side: slot.side,
    restingPairId,
    playingPairId,
    updates,
  };
}
