import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";
import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import { applyAmericanoResult } from "./americanoStandings";

function createEmptyStats() {
  return {
    pointsFor: 0,
    pointsAgainst: 0,
    gamesPlayed: 0,
    roundsOnBench: 0,
  };
}

export function collectAmericanoPlayersFromSnapshot(
  snap: AmericanoDinamicoSnapshotV1
): AmericanoPlayer[] {
  const nameById = new Map<string, string>();
  for (const p of snap.ranking) {
    nameById.set(p.id, p.name);
  }
  for (const r of snap.rounds) {
    for (const b of r.benchPlayers) {
      nameById.set(b.id, b.name);
    }
    for (const m of r.matches) {
      for (const pl of m.teamA) nameById.set(pl.id, pl.name);
      for (const pl of m.teamB) nameById.set(pl.id, pl.name);
    }
  }
  return Array.from(nameById.entries()).map(([id, name]) => ({
    id,
    name,
    stats: createEmptyStats(),
  }));
}

function rebuildStateFromRounds(
  sourceRounds: AmericanoRound[],
  sourcePlayers: AmericanoPlayer[]
): { players: AmericanoPlayer[]; rounds: AmericanoRound[] } {
  const rebuiltPlayers = sourcePlayers.map((p) => ({
    ...p,
    stats: createEmptyStats(),
  }));
  const playerMap = new Map(rebuiltPlayers.map((p) => [p.id, p]));

  const rebuiltRounds: AmericanoRound[] = sourceRounds.map((round) => {
    const benchPlayers = round.benchPlayers
      .map((p) => playerMap.get(p.id))
      .filter((p): p is AmericanoPlayer => !!p);
    benchPlayers.forEach((p) => {
      p.stats.roundsOnBench += 1;
    });

    const matches = round.matches.map((match) => ({
      ...match,
      teamA: [
        playerMap.get(match.teamA[0].id)!,
        playerMap.get(match.teamA[1].id)!,
      ] as [AmericanoPlayer, AmericanoPlayer],
      teamB: [
        playerMap.get(match.teamB[0].id)!,
        playerMap.get(match.teamB[1].id)!,
      ] as [AmericanoPlayer, AmericanoPlayer],
    }));

    return {
      ...round,
      matches,
      benchPlayers,
    };
  });

  rebuiltRounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (
        typeof match.scoreA === "number" &&
        typeof match.scoreB === "number" &&
        match.scoreA >= 0 &&
        match.scoreB >= 0
      ) {
        applyAmericanoResult(match, match.scoreA, match.scoreB);
      }
    });
  });

  return { players: rebuiltPlayers, rounds: rebuiltRounds };
}

/** Reconstruye jugadores y rondas con stats desde un snapshot guardado. */
export function rebuildAmericanoFromSnapshot(
  snap: AmericanoDinamicoSnapshotV1
): { players: AmericanoPlayer[]; rounds: AmericanoRound[] } | null {
  if (!snap.rounds.length) return null;
  try {
    const sourcePlayers = collectAmericanoPlayersFromSnapshot(snap);
    const playerMap = new Map(sourcePlayers.map((p) => [p.id, p]));
    const convertedRounds: AmericanoRound[] = snap.rounds.map((sr) => ({
      roundNumber: sr.roundNumber,
      phase: sr.phase,
      benchPlayers: sr.benchPlayers
        .map((b) => playerMap.get(b.id))
        .filter((p): p is AmericanoPlayer => !!p),
      matches: sr.matches.map((sm) => {
        const a0 = playerMap.get(sm.teamA[0].id);
        const a1 = playerMap.get(sm.teamA[1].id);
        const b0 = playerMap.get(sm.teamB[0].id);
        const b1 = playerMap.get(sm.teamB[1].id);
        if (!a0 || !a1 || !b0 || !b1) {
          throw new Error("americano_snapshot_missing_player");
        }
        return {
          id: sm.id,
          court: sm.court,
          scoreA: sm.scoreA,
          scoreB: sm.scoreB,
          teamA: [a0, a1] as [AmericanoPlayer, AmericanoPlayer],
          teamB: [b0, b1] as [AmericanoPlayer, AmericanoPlayer],
        };
      }),
    }));
    return rebuildStateFromRounds(convertedRounds, sourcePlayers);
  } catch (e) {
    console.warn("[americano] rebuildAmericanoFromSnapshot:", e);
    return null;
  }
}
