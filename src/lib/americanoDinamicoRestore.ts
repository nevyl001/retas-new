import { applyAmericanoResult } from "./americanoStandings";
import type { MutableRefObject } from "react";
import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";

export type AmericanoPhase = "registration" | "playing" | "finished";

function createEmptyStats() {
  return {
    pointsFor: 0,
    pointsAgainst: 0,
    gamesPlayed: 0,
    roundsOnBench: 0,
  };
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

function collectSourcePlayersFromSnapshot(
  snap: AmericanoDinamicoSnapshotV1
): AmericanoPlayer[] {
  const nameById = new Map<string, string>();
  const orderedIds: string[] = [];

  const add = (id: string, name: string) => {
    if (!nameById.has(id)) {
      orderedIds.push(id);
    }
    nameById.set(id, name);
  };

  if (snap.roster?.length) {
    for (const p of snap.roster) add(p.id, p.name);
  }
  for (const p of snap.ranking) add(p.id, p.name);
  for (const r of snap.rounds) {
    for (const b of r.benchPlayers) add(b.id, b.name);
    for (const m of r.matches) {
      for (const pl of m.teamA) add(pl.id, pl.name);
      for (const pl of m.teamB) add(pl.id, pl.name);
    }
  }

  return orderedIds.map((id) => ({
    id,
    name: nameById.get(id) ?? id,
    stats: createEmptyStats(),
  }));
}

function inferCourtsFromRounds(rounds: AmericanoRound[]): number {
  let maxCourt = 1;
  for (const r of rounds) {
    for (const m of r.matches) {
      maxCourt = Math.max(maxCourt, m.court);
    }
  }
  return maxCourt;
}

export interface ApplyAmericanoSnapshotRefs {
  baseRosterRef: MutableRefObject<AmericanoPlayer[]>;
  totalRoundsRef: MutableRefObject<number>;
  courtsRef: MutableRefObject<number>;
}

export interface ApplyAmericanoSnapshotSetters {
  setPlayers: (players: AmericanoPlayer[]) => void;
  setRounds: (rounds: AmericanoRound[]) => void;
  setCurrentRoundIndex: (index: number) => void;
  setPhase: (phase: AmericanoPhase) => void;
}

/** Restaura el estado del hook desde un snapshot (local o Supabase). */
export function applyAmericanoSnapshotToState(
  snap: AmericanoDinamicoSnapshotV1,
  setters: ApplyAmericanoSnapshotSetters,
  refs: ApplyAmericanoSnapshotRefs
): boolean {
  const { setPlayers, setRounds, setCurrentRoundIndex, setPhase } = setters;
  const { baseRosterRef, totalRoundsRef, courtsRef } = refs;

  if (snap.rounds.length === 0) {
    if (
      snap.ranking.length > 0 &&
      snap.tournamentPhase !== "playing" &&
      snap.tournamentPhase !== "finished"
    ) {
      setPlayers(
        snap.ranking.map((p) => ({
          id: p.id,
          name: p.name,
          stats: { ...createEmptyStats(), ...p.stats },
        }))
      );
      setRounds([]);
      setCurrentRoundIndex(0);
      setPhase("registration");
      baseRosterRef.current = [];
      totalRoundsRef.current = 0;
      courtsRef.current = 1;
      return true;
    }
    return false;
  }

  try {
    const sourcePlayers = collectSourcePlayersFromSnapshot(snap);
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

    const { players: pl, rounds: rl } = rebuildStateFromRounds(
      convertedRounds,
      sourcePlayers
    );

    baseRosterRef.current = sourcePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      stats: createEmptyStats(),
    }));

    const maxRoundNumber = Math.max(
      ...snap.rounds.map((r) => r.roundNumber),
      1
    );
    totalRoundsRef.current =
      snap.totalRounds && snap.totalRounds > 0
        ? snap.totalRounds
        : maxRoundNumber;

    courtsRef.current = inferCourtsFromRounds(rl);

    const restoredPhase: AmericanoPhase =
      snap.tournamentPhase === "finished" ? "finished" : "playing";

    const currentIdx = Math.max(0, rl.length - 1);

    setPlayers(pl);
    setRounds(rl);
    setCurrentRoundIndex(currentIdx);
    setPhase(restoredPhase);
    return true;
  } catch (e) {
    console.warn(
      "Americano dinámico: no se pudo restaurar el estado guardado.",
      e
    );
    return false;
  }
}
