/**
 * Sincronización Americano Dinámico ↔ Supabase (`tournament_public_config.americano_live`).
 * Supabase es la fuente de verdad entre dispositivos; localStorage es caché offline.
 */
import {
  fetchAmericanoLivePublic,
  upsertAmericanoLivePublic,
} from "./database";
import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";
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

  const chosen = pickNewerAmericanoSnapshot(local, remote);
  if (!chosen) {
    return { snapshot: null, source: "none", remoteAvailable };
  }

  if (remote && chosen === remote) {
    saveAmericanoDinamicoSnapshot(tid, remote, { skipDispatch: true });
    return { snapshot: remote, source: "remote", remoteAvailable };
  }

  return {
    snapshot: chosen,
    source: local ? "local" : "none",
    remoteAvailable,
  };
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
