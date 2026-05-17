/**
 * Persistencia local del modo Americano Dinámico por reta (tournament id).
 * No requiere columnas nuevas en Supabase; permite mostrar resultados al reabrir la reta.
 */
import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import { navigateAppTo } from "./appRouting";

const STORAGE_KEY_PREFIX = "americano_dinamico_snapshot_v1_";

/** sessionStorage: última reta Americano en esta pestaña (F5 si la URL pierde el query). */
export const AMERICANO_SESSION_TOURNAMENT_KEY =
  "americano_dinamico_last_tournament_id";

/** localStorage: reta Americano activa (persiste al volver al home). */
export const AMERICANO_LOCAL_ACTIVE_KEY = "riviera_americano_active_id";

const AMERICANO_MARK_PREFIX = "rivieraapp_americano_tournament_";

export function persistAmericanoActiveTournamentId(tournamentId: string): void {
  const id = tournamentId.trim();
  if (!id) return;
  try {
    localStorage.setItem(AMERICANO_LOCAL_ACTIVE_KEY, id);
    sessionStorage.setItem(AMERICANO_SESSION_TOURNAMENT_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readAmericanoActiveTournamentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromLocal = localStorage.getItem(AMERICANO_LOCAL_ACTIVE_KEY)?.trim();
    if (fromLocal) return fromLocal;
    return readAmericanoTournamentIdFromSession();
  } catch {
    return null;
  }
}

export function markTournamentAsAmericano(tournamentId: string): void {
  const id = tournamentId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(`${AMERICANO_MARK_PREFIX}${id}`, "1");
  } catch {
    /* ignore */
  }
}

export function isMarkedAmericanoTournament(tournamentId: string): boolean {
  try {
    return (
      sessionStorage.getItem(`${AMERICANO_MARK_PREFIX}${tournamentId.trim()}`) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function isAmericanoResumable(tournamentId: string): boolean {
  const snap = loadAmericanoDinamicoSnapshot(tournamentId);
  if (snap?.tournamentPhase === "finished") return false;
  if (snap) return true;
  return isMarkedAmericanoTournament(tournamentId);
}

export function navigateToAmericanoDinamico(
  tournamentId: string,
  userId: string
): void {
  persistAmericanoActiveTournamentId(tournamentId);
  markTournamentAsAmericano(tournamentId);
  const params = new URLSearchParams({ tournamentId, userId });
  navigateAppTo(`/americano-dinamico?${params.toString()}`);
}

export function readAmericanoTournamentIdFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(AMERICANO_SESSION_TOURNAMENT_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Id para persistencia: prop de App > ?tournamentId= > sessionStorage.
 * Así no dependemos solo del padre si la URL ya trae el id.
 */
export function resolveAmericanoTournamentId(
  fromProps?: string | null
): string | null {
  const trimmed = typeof fromProps === "string" ? fromProps.trim() : "";
  if (trimmed) return trimmed;
  if (typeof window === "undefined") return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search)
      .get("tournamentId")
      ?.trim();
    if (fromQuery) return fromQuery;
    return readAmericanoTournamentIdFromSession();
  } catch {
    return null;
  }
}

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
  phase: 1 | 2;
  benchPlayers: AmericanoSnapshotPlayer[];
  matches: AmericanoSnapshotMatch[];
}

export type AmericanoSnapshotTournamentPhase =
  | "registration"
  | "playing"
  | "finished";

export interface AmericanoDinamicoSnapshotV1 {
  version: 1;
  savedAt: string;
  /** Fase al guardar; la vista pública usa `finished` para podio y mensaje. */
  tournamentPhase?: AmericanoSnapshotTournamentPhase;
  /** Total de rondas planificado (para etiqueta "Final" en la última). */
  totalRounds?: number;
  ranking: AmericanoSnapshotPlayer[];
  rounds: AmericanoSnapshotRound[];
}

export function saveAmericanoDinamicoSnapshot(
  tournamentId: string,
  snapshot: AmericanoDinamicoSnapshotV1,
  opts?: { skipDispatch?: boolean }
): void {
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${tournamentId}`,
      JSON.stringify(snapshot)
    );
    if (!opts?.skipDispatch) {
      window.dispatchEvent(
        new CustomEvent("americano-dinamico-snapshot", {
          detail: { tournamentId },
        })
      );
    }
  } catch (e) {
    console.warn("No se pudo guardar snapshot Americano:", e);
  }
}

/** Canchas usadas en el Americano (máx. número de cancha en partidos guardados). */
export function inferAmericanoCourtsFromSnapshot(
  tournamentId: string
): number | null {
  const snap = loadAmericanoDinamicoSnapshot(tournamentId);
  if (!snap?.rounds?.length) return null;
  let maxCourt = 0;
  for (const round of snap.rounds) {
    for (const match of round.matches) {
      maxCourt = Math.max(maxCourt, match.court);
    }
  }
  return maxCourt > 0 ? maxCourt : null;
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

/** Serializa ranking y rondas del Americano Dinámico (incluye fase para vista pública). */
export function buildAmericanoDinamicoSnapshot(
  ranking: AmericanoPlayer[],
  rounds: AmericanoRound[],
  tournamentPhase: AmericanoSnapshotTournamentPhase,
  totalRounds: number
): AmericanoDinamicoSnapshotV1 {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    tournamentPhase,
    totalRounds: totalRounds > 0 ? totalRounds : undefined,
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
