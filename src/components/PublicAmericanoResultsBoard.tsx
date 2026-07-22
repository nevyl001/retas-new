import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAmericanoLivePublic,
  getTournamentByIdPublic,
  type FetchAmericanoLivePublicResult,
} from "../lib/database";
import type { AmericanoDinamicoSnapshotV1 } from "../lib/americanoDinamicoStorage";
import { loadAmericanoDinamicoSnapshot } from "../lib/americanoDinamicoStorage";
import { AMERICANO_RESULTS_BOARD_POLL_INTERVAL_MS } from "../lib/americano/publicPoll";
import {
  ClubExperienceScope,
  formatTenantDocumentTitle,
  PublicEventBrandIdentity,
  PublicEventNeutralLoading,
  useClubExperience,
  useOrganizerDisplayName,
} from "../club-experience";
import { useVisiblePolling } from "../hooks/useVisiblePolling";
import { AmericanoTournamentSummary } from "./AmericanoDinamico/AmericanoTournamentSummary";
import "./PublicAmericanoResultsBoard.css";
import "../styles/riviera-public-board.css";

interface PublicAmericanoResultsBoardProps {
  tournamentId: string;
}

const AmericanoResultsBoardHeader: React.FC<{
  tournamentName: string | null;
  tournamentDescription: string | null;
}> = ({ tournamentName, tournamentDescription }) => {
  const { isClubBranded, isScopeBrandingReady } = useClubExperience();
  const organizerName = useOrganizerDisplayName();

  return (
    <header className="public-americano-board__header">
      <div className="public-americano-board__brand">
        {isScopeBrandingReady ? (
          <PublicEventBrandIdentity className="public-americano-board__club-identity" />
        ) : null}
        <h1 className="public-americano-board__title">
          {tournamentName || "Resultados"}
        </h1>
        {tournamentDescription ? (
          <p className="public-americano-board__desc">{tournamentDescription}</p>
        ) : null}
        {isScopeBrandingReady ? (
          <p className="public-americano-board__tagline">
            {isClubBranded
              ? `${organizerName} · Vista pública`
              : "Vista pública"}
          </p>
        ) : null}
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
  const lastMergedRef = useRef<FetchAmericanoLivePublicResult | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    lastMergedRef.current = null;
    setSnapshot(null);
    setTournamentName(null);
    setTournamentDescription(null);
    setOrganizadorId(null);
    setLoadError(null);
    return () => {
      cancelledRef.current = true;
    };
  }, [tournamentId]);

  // Metadatos del torneo una sola vez; el poll solo refresca americano_live.
  useEffect(() => {
    let cancelled = false;
    const tid = tournamentId.trim();
    if (!tid) return;
    (async () => {
      try {
        const tournament = await getTournamentByIdPublic(tid).catch(() => null);
        if (cancelled || cancelledRef.current) return;
        if (tournament?.name) setTournamentName(tournament.name);
        const desc =
          typeof tournament?.description === "string"
            ? tournament.description.trim()
            : "";
        setTournamentDescription(desc || null);
        setOrganizadorId(
          typeof tournament?.user_id === "string" ? tournament.user_id : null
        );
      } catch {
        /* opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const loadLive = useCallback(async () => {
    const tid = tournamentId.trim();
    if (!tid) return;
    try {
      setLoadError(null);
      const remote = await fetchAmericanoLivePublic(tid);
      if (cancelledRef.current) return;

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
    } catch (e) {
      if (cancelledRef.current) return;
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

  useVisiblePolling({
    callback: loadLive,
    intervalMs: AMERICANO_RESULTS_BOARD_POLL_INTERVAL_MS,
  });

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
    <ClubExperienceScope
      organizadorId={organizadorId}
      pendingUntilOrganizador
    >
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

        {!snapshot && !loadError ? (
          <PublicEventNeutralLoading message="Cargando resultados…" />
        ) : null}

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
