import React, { useCallback, useEffect, useState } from "react";
import {
  fetchAmericanoLivePublic,
  getTournamentByIdPublic,
  type FetchAmericanoLivePublicResult,
} from "../lib/database";
import type { AmericanoDinamicoSnapshotV1 } from "../lib/americanoDinamicoStorage";
import { loadAmericanoDinamicoSnapshot } from "../lib/americanoDinamicoStorage";
import {
  ClubExperienceScope,
  ClubIdentity,
  formatTenantDocumentTitle,
  useClubExperience,
  useOrganizerDisplayName,
} from "../club-experience";
import { AmericanoTournamentSummary } from "./AmericanoDinamico/AmericanoTournamentSummary";
import "./PublicAmericanoResultsBoard.css";
import "../styles/riviera-public-board.css";

const POLL_MS = 8000;

interface PublicAmericanoResultsBoardProps {
  tournamentId: string;
}

const AmericanoResultsBoardHeader: React.FC<{
  tournamentName: string | null;
  tournamentDescription: string | null;
}> = ({ tournamentName, tournamentDescription }) => {
  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName();

  return (
    <header className="public-americano-board__header">
      <div className="public-americano-board__brand">
        {isClubBranded ? (
          <ClubIdentity
            variant="compact"
            showTagline={false}
            logoSurface="dark"
            wordmarkOnly
            className="public-americano-board__club-identity"
          />
        ) : null}
        <h1 className="public-americano-board__title">
          {tournamentName || "Resultados"}
        </h1>
        {tournamentDescription ? (
          <p className="public-americano-board__desc">{tournamentDescription}</p>
        ) : null}
        <p className="public-americano-board__tagline">
          {organizerName} · Vista pública
        </p>
      </div>
    </header>
  );
};

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
  const [tournamentDescription, setTournamentDescription] = useState<
    string | null
  >(null);
  const [organizadorId, setOrganizadorId] = useState<string | null>(null);
  const organizerName = useOrganizerDisplayName(organizadorId ?? undefined);
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
      const desc =
        typeof tournament?.description === "string"
          ? tournament.description.trim()
          : "";
      setTournamentDescription(desc || null);
      setOrganizadorId(
        typeof tournament?.user_id === "string" ? tournament.user_id : null
      );
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
    setTournamentDescription(null);
    setOrganizadorId(null);
    setLoadError(null);
  }, [tournamentId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const defaultTitle = formatTenantDocumentTitle(
      null,
      organizerName,
      "Pantalla de resultados"
    );
    document.title = formatTenantDocumentTitle(
      tournamentName,
      organizerName,
      "Pantalla de resultados"
    );
    return () => {
      document.title = defaultTitle;
    };
  }, [tournamentName, organizerName]);

  return (
    <ClubExperienceScope organizadorId={organizadorId}>
    <div className="public-americano-board">
      <AmericanoResultsBoardHeader
        tournamentName={tournamentName}
        tournamentDescription={tournamentDescription}
      />

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

      {snapshot?.savedAt && (
        <footer className="public-americano-board__footer" aria-live="polite">
          <p className="public-americano-board__meta">
            Actualización en tiempo real · Última actualización:{" "}
            {new Date(snapshot.savedAt).toLocaleString()}
          </p>
        </footer>
      )}
    </div>
    </ClubExperienceScope>
  );
};

export default PublicAmericanoResultsBoard;
