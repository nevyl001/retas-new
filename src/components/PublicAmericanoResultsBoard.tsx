import React, { useCallback, useEffect, useState } from "react";
import {
  fetchAmericanoLivePublic,
  getTournamentByIdPublic,
  type FetchAmericanoLivePublicResult,
} from "../lib/database";
import type { AmericanoDinamicoSnapshotV1 } from "../lib/americanoDinamicoStorage";
import { loadAmericanoDinamicoSnapshot } from "../lib/americanoDinamicoStorage";
import { AmericanoTournamentSummary } from "./AmericanoDinamico/AmericanoTournamentSummary";
import "./PublicAmericanoResultsBoard.css";

const POLL_MS = 8000;

interface PublicAmericanoResultsBoardProps {
  tournamentId: string;
}

function mergeFetch(
  prev: FetchAmericanoLivePublicResult | null,
  next: FetchAmericanoLivePublicResult
): FetchAmericanoLivePublicResult {
  if (next.status === "ok") return next;
  if (prev?.status === "ok") return prev;
  return next;
}

export const PublicAmericanoResultsBoard: React.FC<
  PublicAmericanoResultsBoardProps
> = ({ tournamentId }) => {
  const [snapshot, setSnapshot] = useState<AmericanoDinamicoSnapshotV1 | null>(
    null
  );
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastMergedRef = React.useRef<FetchAmericanoLivePublicResult | null>(
    null
  );

  const load = useCallback(async () => {
    const tid = tournamentId.trim();
    if (!tid) return;
    try {
      setLoadError(null);
      const [remote, tournament] = await Promise.all([
        fetchAmericanoLivePublic(tid),
        getTournamentByIdPublic(tid).catch(() => null),
      ]);

      const merged = mergeFetch(lastMergedRef.current, remote);
      lastMergedRef.current = merged;

      if (remote.status === "ok") {
        setSnapshot(remote.snapshot);
      } else if (merged.status === "ok") {
        /* mantener último ok */
      } else {
        let local: AmericanoDinamicoSnapshotV1 | null = null;
        try {
          local = loadAmericanoDinamicoSnapshot(tid);
        } catch {
          local = null;
        }
        setSnapshot(local);
      }

      if (tournament?.name) setTournamentName(tournament.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      try {
        const local = loadAmericanoDinamicoSnapshot(tid);
        if (local) setSnapshot(local);
      } catch {
        /* ignore */
      }
    }
  }, [tournamentId]);

  useEffect(() => {
    lastMergedRef.current = null;
    setSnapshot(null);
    setTournamentName(null);
    setLoadError(null);
  }, [tournamentId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="public-americano-board">
      <header className="public-americano-board__header">
        <p className="public-americano-board__eyebrow">Americano dinámico</p>
        <h1 className="public-americano-board__title">
          {tournamentName || "Resultados"}
        </h1>
        {snapshot?.savedAt && (
          <p className="public-americano-board__meta">
            Última actualización:{" "}
            {new Date(snapshot.savedAt).toLocaleString()}
          </p>
        )}
      </header>

      {loadError && (
        <p className="public-americano-board__error" role="alert">
          {loadError}
        </p>
      )}

      {!snapshot && !loadError && (
        <p className="public-americano-board__waiting">Cargando resultados…</p>
      )}

      {snapshot && (
        <AmericanoTournamentSummary snapshot={snapshot} variant="display" />
      )}
    </div>
  );
};

export default PublicAmericanoResultsBoard;
