/**
 * Sincronización Americano Dinámico ↔ Supabase (`tournament_public_config.americano_live`).
 * Supabase es la fuente de verdad entre dispositivos; localStorage es caché offline.
 */
import {
  fetchAmericanoLivePublic,
  upsertAmericanoLivePublic,
  applyAmericanoLiveMatchScore,
  applyAmericanoLiveMetadata,
  applyAmericanoNewRound,
  type ApplyAmericanoLiveMatchScoreResult,
  type ApplyAmericanoNewRoundResult,
} from "./database";
import type {
  AmericanoDinamicoSnapshotV1,
  AmericanoSnapshotPlayer,
  AmericanoSnapshotRosterEntry,
  AmericanoSnapshotRound,
  AmericanoSnapshotTournamentPhase,
} from "./americanoDinamicoStorage";
import {
  loadAmericanoDinamicoSnapshot,
  saveAmericanoDinamicoSnapshot,
} from "./americanoDinamicoStorage";

export function snapshotSavedAtMs(
  snap: AmericanoDinamicoSnapshotV1 | null | undefined
): number {
  if (!snap?.savedAt) return 0;
  const t = new Date(snap.savedAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Elige el snapshot más reciente por `savedAt`. */
export function pickNewerAmericanoSnapshot(
  local: AmericanoDinamicoSnapshotV1 | null,
  remote: AmericanoDinamicoSnapshotV1 | null
): AmericanoDinamicoSnapshotV1 | null {
  if (!local) return remote;
  if (!remote) return local;
  return snapshotSavedAtMs(remote) >= snapshotSavedAtMs(local) ? remote : local;
}

/** En prep, combina metadata (rondas/canchas) aunque gane el snapshot más nuevo. */
export function mergeAmericanoPrepSnapshots(
  local: AmericanoDinamicoSnapshotV1 | null,
  remote: AmericanoDinamicoSnapshotV1 | null
): AmericanoDinamicoSnapshotV1 | null {
  const base = pickNewerAmericanoSnapshot(local, remote);
  if (!base) return null;

  const inPrep =
    base.tournamentPhase === "registration" && base.rounds.length === 0;
  if (!inPrep) return base;

  const other = base === local ? remote : local;
  if (!other) return base;

  const totalRounds = Math.max(base.totalRounds ?? 0, other.totalRounds ?? 0);
  const plannedCourts = Math.max(
    base.plannedCourts ?? 0,
    other.plannedCourts ?? 0
  );

  if (
    totalRounds === (base.totalRounds ?? 0) &&
    plannedCourts === (base.plannedCourts ?? 0)
  ) {
    return base;
  }

  return {
    ...base,
    totalRounds: totalRounds > 0 ? totalRounds : undefined,
    plannedCourts: plannedCourts > 0 ? plannedCourts : undefined,
  };
}

export async function fetchAmericanoDinamicoSnapshotRemote(
  tournamentId: string
): Promise<AmericanoDinamicoSnapshotV1 | null> {
  const tid = tournamentId.trim();
  if (!tid) return null;
  const result = await fetchAmericanoLivePublic(tid);
  if (result.status === "ok") return result.snapshot;
  return null;
}

/** Lee local + remoto y devuelve el más reciente (cachea local si gana remoto). */
export async function loadAmericanoDinamicoSnapshotMerged(
  tournamentId: string
): Promise<{
  snapshot: AmericanoDinamicoSnapshotV1 | null;
  source: "local" | "remote" | "none";
  remoteAvailable: boolean;
}> {
  const tid = tournamentId.trim();
  if (!tid) {
    return { snapshot: null, source: "none", remoteAvailable: false };
  }

  const local = loadAmericanoDinamicoSnapshot(tid);
  const remoteResult = await fetchAmericanoLivePublic(tid);
  const remoteAvailable = remoteResult.status !== "missing_column";
  const remote =
    remoteResult.status === "ok" ? remoteResult.snapshot : null;

  const chosen = mergeAmericanoPrepSnapshots(local, remote);
  if (!chosen) {
    return { snapshot: null, source: "none", remoteAvailable };
  }

  const source: "local" | "remote" | "none" =
    remote && pickNewerAmericanoSnapshot(local, remote) === remote
      ? "remote"
      : local
        ? "local"
        : "none";

  if (source === "remote" || chosen !== local) {
    saveAmericanoDinamicoSnapshot(tid, chosen, { skipDispatch: true });
  }

  return {
    snapshot: chosen,
    source,
    remoteAvailable,
  };
}

/**
 * Reinicio del americano en la nube: sobreescribe `americano_live` con un
 * snapshot vacío de "registration". Al recargar u otro dispositivo, el merge
 * elige este snapshot vacío y el estado vuelve a registro (sin rondas ni
 * ranking). NO toca participaciones/ledger/ROMC: solo el snapshot en vivo.
 * Pensado para reiniciar un americano que aún NO ha finalizado.
 */
export async function resetAmericanoDinamicoRemote(
  tournamentId: string
): Promise<boolean> {
  const tid = tournamentId.trim();
  if (!tid) return false;
  const emptySnapshot: AmericanoDinamicoSnapshotV1 = {
    version: 1,
    savedAt: new Date().toISOString(),
    tournamentPhase: "registration",
    totalRounds: 0,
    roster: [],
    ranking: [],
    rounds: [],
  };
  return upsertAmericanoLivePublic(tid, emptySnapshot);
}

/** Guarda en localStorage y publica en Supabase (fuente de verdad en nube). */
export async function persistAmericanoDinamicoSnapshot(
  tournamentId: string,
  snapshot: AmericanoDinamicoSnapshotV1,
  opts?: { skipDispatch?: boolean }
): Promise<boolean> {
  const tid = tournamentId.trim();
  if (!tid) return false;

  saveAmericanoDinamicoSnapshot(tid, snapshot, {
    skipDispatch: opts?.skipDispatch,
  });
  return upsertAmericanoLivePublic(tid, snapshot);
}

/** ¿Hay americano en curso en local o en Supabase? */
export async function isAmericanoResumableAsync(
  tournamentId: string
): Promise<boolean> {
  const tid = tournamentId.trim();
  if (!tid) return false;

  const { snapshot } = await loadAmericanoDinamicoSnapshotMerged(tid);
  if (!snapshot) return false;
  if (snapshot.tournamentPhase === "finished") return false;
  return snapshot.ranking.length > 0 || snapshot.rounds.length > 0;
}

/**
 * Guardado atómico de UN partido en vivo (BLK-02) — ver
 * src/lib/database.ts:applyAmericanoLiveMatchScore. La unidad de
 * concurrencia es el partido: dos dispositivos guardando partidos distintos
 * nunca se pisan entre sí.
 */
export async function persistAmericanoDinamicoMatchScore(params: {
  tournamentId: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  ranking?: AmericanoSnapshotPlayer[];
  phase?: AmericanoSnapshotTournamentPhase;
  totalRounds?: number;
  roster?: AmericanoSnapshotRosterEntry[];
  force?: boolean;
}): Promise<ApplyAmericanoLiveMatchScoreResult> {
  return applyAmericanoLiveMatchScore(params);
}

/**
 * Guardado de metadata (ranking/fase/roster) SIN tocar `rounds` — para el
 * efecto debounced de AmericanoDinamicoScreen durante "playing"/"finished",
 * donde `rounds` ya es propiedad exclusiva de
 * persistAmericanoDinamicoMatchScore.
 */
export async function persistAmericanoDinamicoMetadata(params: {
  tournamentId: string;
  ranking?: AmericanoSnapshotPlayer[];
  phase?: AmericanoSnapshotTournamentPhase;
  totalRounds?: number;
  roster?: AmericanoSnapshotRosterEntry[];
}): Promise<boolean> {
  return applyAmericanoLiveMetadata(params);
}

/**
 * Key determinística (NO un UUID aleatorio): el mismo torneo + el mismo
 * número de ronda producen siempre la misma key, así que un reintento de
 * red de la MISMA operación (p. ej. un timeout donde el servidor sí llegó a
 * aplicarla) es idempotente por diseño — nunca se interpreta como una ronda
 * nueva.
 */
export function buildAmericanoRoundIdempotencyKey(
  tournamentId: string,
  roundNumber: number
): string {
  return `${tournamentId}:round:${roundNumber}`;
}

/**
 * Empuja la ESTRUCTURA de una ronda nueva al servidor (FC-01, Fase C1) — ver
 * supabase/migrations/0007_apply_americano_new_round.sql. A diferencia de
 * persistAmericanoDinamicoMatchScore (que solo parchea un marcador dentro de
 * una ronda ya existente), esta función es la que hace que la ronda misma
 * (qué pareja juega contra cuál, en qué cancha) exista en el servidor.
 */
export async function persistAmericanoNewRound(params: {
  tournamentId: string;
  roundNumber: number;
  round: AmericanoSnapshotRound;
  ranking?: AmericanoSnapshotPlayer[];
  phase?: AmericanoSnapshotTournamentPhase;
  totalRounds?: number;
  roster?: AmericanoSnapshotRosterEntry[];
}): Promise<ApplyAmericanoNewRoundResult> {
  return applyAmericanoNewRound({
    ...params,
    idempotencyKey: buildAmericanoRoundIdempotencyKey(
      params.tournamentId,
      params.roundNumber
    ),
  });
}

export function isValidAmericanoSnapshot(
  raw: unknown
): raw is AmericanoDinamicoSnapshotV1 {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  return (
    s.version === 1 &&
    Array.isArray(s.rounds) &&
    Array.isArray(s.ranking)
  );
}
