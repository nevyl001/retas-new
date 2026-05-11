/**
 * Persistencia local del modo Americano Dinámico por reta (tournament id).
 * No requiere columnas nuevas en Supabase; permite mostrar resultados al reabrir la reta.
 */
import type { AmericanoPlayer, AmericanoRound } from "./db/types";

const STORAGE_KEY_PREFIX = "americano_dinamico_snapshot_v1_";

export interface AmericanoSnapshotPlayer {
  id: string;
  name: string;
  stats: {
    pointsFor: number;
    pointsAgainst: number;
    gamesPlayed: number;
    roundsOnBench: number;
  };
}

export interface AmericanoSnapshotMatch {
  id: string;
  court: number;
  scoreA?: number;
  scoreB?: number;
  teamA: [AmericanoSnapshotPlayer, AmericanoSnapshotPlayer];
  teamB: [AmericanoSnapshotPlayer, AmericanoSnapshotPlayer];
}

export interface AmericanoSnapshotRound {
  roundNumber: number;
  phase: 1 | 2 | 3;
  benchPlayers: AmericanoSnapshotPlayer[];
  matches: AmericanoSnapshotMatch[];
}

export interface AmericanoDinamicoSnapshotV1 {
  version: 1;
  savedAt: string;
  ranking: AmericanoSnapshotPlayer[];
  rounds: AmericanoSnapshotRound[];
}

export function saveAmericanoDinamicoSnapshot(
  tournamentId: string,
  snapshot: AmericanoDinamicoSnapshotV1
): void {
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${tournamentId}`,
      JSON.stringify(snapshot)
    );
    window.dispatchEvent(
      new CustomEvent("americano-dinamico-snapshot", {
        detail: { tournamentId },
      })
    );
  } catch (e) {
    console.warn("No se pudo guardar snapshot Americano:", e);
  }
}

export function loadAmericanoDinamicoSnapshot(
  tournamentId: string
): AmericanoDinamicoSnapshotV1 | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tournamentId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as AmericanoDinamicoSnapshotV1;
    if (data?.version !== 1 || !Array.isArray(data.rounds) || !Array.isArray(data.ranking)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearAmericanoDinamicoSnapshot(tournamentId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${tournamentId}`);
  } catch {
    /* ignore */
  }
}

function miniPlayer(p: AmericanoPlayer): AmericanoSnapshotPlayer {
  return {
    id: p.id,
    name: p.name,
    stats: { ...p.stats },
  };
}

/** Serializa ranking y rondas actuales del hook Americano Dinámico. */
export function buildAmericanoDinamicoSnapshot(
  ranking: AmericanoPlayer[],
  rounds: AmericanoRound[]
): AmericanoDinamicoSnapshotV1 {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    ranking: ranking.map(miniPlayer),
    rounds: rounds.map((r) => ({
      roundNumber: r.roundNumber,
      phase: r.phase,
      benchPlayers: r.benchPlayers.map(miniPlayer),
      matches: r.matches.map((m) => ({
        id: m.id,
        court: m.court,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        teamA: [miniPlayer(m.teamA[0]), miniPlayer(m.teamA[1])],
        teamB: [miniPlayer(m.teamB[0]), miniPlayer(m.teamB[1])],
      })),
    })),
  };
}
