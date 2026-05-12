import React, { useCallback, useEffect, useState } from "react";
import {
  fetchAmericanoLivePublic,
  getTournamentByIdPublic,
  type FetchAmericanoLivePublicResult,
} from "../lib/database";
import type {
  AmericanoDinamicoSnapshotV1,
  AmericanoSnapshotRound,
} from "../lib/americanoDinamicoStorage";
import { loadAmericanoDinamicoSnapshot } from "../lib/americanoDinamicoStorage";
import { americanoRoundPhaseCaption } from "../lib/americanoPhaseLabels";
import "./PublicAmericanoView.css";

const POLL_MS = 4000;

interface PublicAmericanoViewProps {
  tournamentId: string;
}

function applyFetchResult(
  prev: FetchAmericanoLivePublicResult | null,
  next: FetchAmericanoLivePublicResult
): FetchAmericanoLivePublicResult {
  if (next.status === "ok") return next;
  if (next.status === "missing_column") return next;
  if (next.status === "fetch_error") {
    if (prev?.status === "ok") return prev;
    return next;
  }
  if (next.status === "empty") {
    if (prev?.status === "ok") return prev;
    return next;
  }
  return next;
}

export const PublicAmericanoView: React.FC<PublicAmericanoViewProps> = ({
  tournamentId,
}) => {
  const [snapshot, setSnapshot] = useState<AmericanoDinamicoSnapshotV1 | null>(
    null
  );
  const [fetchStatus, setFetchStatus] =
    useState<FetchAmericanoLivePublicResult | null>(null);
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [tournamentFinished, setTournamentFinished] = useState(false);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastMergedFetchRef =
    React.useRef<FetchAmericanoLivePublicResult | null>(null);

  useEffect(() => {
    lastMergedFetchRef.current = null;
    setFetchStatus(null);
    setSnapshot(null);
    setTournamentName(null);
    setTournamentFinished(false);
    setTournamentStarted(false);
    setLoadError(null);
  }, [tournamentId]);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [remote, tournament] = await Promise.all([
        fetchAmericanoLivePublic(tournamentId),
        getTournamentByIdPublic(tournamentId).catch(() => null),
      ]);

      const merged = applyFetchResult(lastMergedFetchRef.current, remote);
      lastMergedFetchRef.current = merged;
      setFetchStatus(merged);

      if (remote.status === "ok") {
        setSnapshot(remote.snapshot);
      } else if (merged.status === "ok") {
        // Mantener último snapshot válido ante respuestas vacías o errores puntuales.
      } else {
        let local: AmericanoDinamicoSnapshotV1 | null = null;
        try {
          local = loadAmericanoDinamicoSnapshot(tournamentId);
        } catch {
          local = null;
        }
        if (local) {
          setSnapshot(local);
        } else {
          setSnapshot(null);
        }
      }

      if (tournament?.name) setTournamentName(tournament.name);
      setTournamentFinished(!!tournament?.is_finished);
      setTournamentStarted(!!tournament?.is_started);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(`No se pudo cargar: ${msg}`);
      let local: AmericanoDinamicoSnapshotV1 | null = null;
      try {
        local = loadAmericanoDinamicoSnapshot(tournamentId);
      } catch {
        local = null;
      }
      if (local) setSnapshot(local);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const roundMatchesSorted = (round: AmericanoSnapshotRound) =>
    [...round.matches].sort((a, b) => a.court - b.court);

  const roundFullyScored = (round: AmericanoSnapshotRound) =>
    round.matches.length > 0 &&
    round.matches.every(
      (m) => typeof m.scoreA === "number" && typeof m.scoreB === "number"
    );

  const totalForPhaseLabels = (() => {
    if (!snapshot) return 0;
    if (snapshot.totalRounds != null && snapshot.totalRounds > 0) {
      return snapshot.totalRounds;
    }
    if (
      snapshot.tournamentPhase === "finished" &&
      snapshot.rounds.length > 0
    ) {
      return Math.max(...snapshot.rounds.map((r) => r.roundNumber));
    }
    return 0;
  })();

  const showFinishedPodium =
    !!snapshot &&
    snapshot.ranking.length > 0 &&
    (snapshot.tournamentPhase === "finished" || tournamentFinished);

  return (
    <div className="public-americano-view">
      <header className="public-americano-view__header">
        <h1 className="public-americano-view__title">Americano en vivo</h1>
        <p className="public-americano-view__meta">
          {tournamentName ? (
            <>
              <strong>{tournamentName}</strong>
              <span> · </span>
            </>
          ) : null}
          Actualización automática cada pocos segundos
        </p>
        {snapshot?.savedAt && (
          <p className="public-americano-view__meta">
            Última publicación:{" "}
            {new Date(snapshot.savedAt).toLocaleString()}
          </p>
        )}
      </header>

      {loadError && (
        <div className="public-americano-view__section public-americano-view__empty">
          {loadError}
        </div>
      )}

      {!loadError &&
        fetchStatus?.status === "missing_column" &&
        !snapshot && (
          <div className="public-americano-view__section public-americano-view__empty">
            <p>
              <strong>No se puede mostrar el Americano en vivo desde internet.</strong>
            </p>
            <p className="public-americano-view__hint">
              En móvil (y en cualquier otro dispositivo) esta pantalla solo lee datos
              guardados en <strong>Supabase</strong>, no el navegador del organizador.
            </p>
            <p className="public-americano-view__hint">
              Falta la columna <code>americano_live</code> en la tabla{" "}
              <code>tournament_public_config</code>. En Supabase → SQL Editor ejecuta
              el archivo del repositorio{" "}
              <code>tournament-americano-public-live.sql</code> y vuelve a abrir el
              Americano en el móvil del organizador unos segundos para que se publique
              el marcador.
            </p>
          </div>
        )}

      {!loadError &&
        fetchStatus?.status === "fetch_error" &&
        !snapshot && (
          <div className="public-americano-view__section public-americano-view__empty">
            <p>
              <strong>No se pudo leer la publicación.</strong>{" "}
              {fetchStatus.message}
            </p>
            <p className="public-americano-view__hint">
              Revisa la URL del proyecto Supabase, la tabla{" "}
              <code>tournament_public_config</code> y las políticas RLS (debe
              permitir <code>SELECT</code> a <code>anon</code>).
            </p>
          </div>
        )}

      {!loadError &&
        fetchStatus?.status === "empty" &&
        !snapshot && (
          <div className="public-americano-view__section public-americano-view__empty">
            <p>
              <strong>Aún no hay datos publicados</strong> para este torneo en
              internet.
            </p>
            <p className="public-americano-view__hint">
              La vista pública <strong>no</strong> lee el mismo móvil u ordenador del
              organizador: solo muestra lo que esté guardado en la nube (Supabase).
            </p>
            {tournamentStarted ? (
              <p className="public-americano-view__hint public-americano-view__hint--warn">
                Esta reta consta como <strong>iniciada</strong>, pero no hay marcador
                publicado. Si ya ejecutaste el torneo, revisa en Supabase la columna{" "}
                <code>americano_live</code> (archivo{" "}
                <code>tournament-americano-public-live.sql</code>) y en el dispositivo
                del organizador la consola por errores de <code>upsert</code> (sesión
                cerrada o permisos RLS).
              </p>
            ) : (
              <p className="public-americano-view__hint">
                El organizador debe tener abierto el Americano de esta reta (URL con{" "}
                <code>?tournamentId=…</code>), pulsar <strong>Iniciar torneo</strong>{" "}
                y esperar unos segundos a que se suba el estado.
              </p>
            )}
          </div>
        )}

      {snapshot && (
        <>
          {snapshot.rounds.length > 0 &&
            snapshot.rounds.map((round, roundIdx) => {
            const isLastRound = roundIdx === snapshot.rounds.length - 1;
            const inProgress = isLastRound && !roundFullyScored(round);
            const matches = roundMatchesSorted(round);
            return (
              <section
                key={`${round.roundNumber}-${round.phase}-${roundIdx}`}
                className="public-americano-view__section"
              >
                <h2>
                  Ronda {round.roundNumber} ·{" "}
                  {americanoRoundPhaseCaption(round, totalForPhaseLabels)}
                  {inProgress ? " · en curso" : ""}
                </h2>
                {round.benchPlayers.length > 0 && (
                  <p className="public-americano-view__bench">
                    <strong>Descansan:</strong>{" "}
                    {round.benchPlayers.map((p) => p.name).join(", ")}
                  </p>
                )}
                <div className="public-americano-view__grid">
                  {matches.map((m) => (
                    <article key={m.id} className="public-americano-match">
                      <div className="public-americano-match__court">
                        Cancha {m.court}
                      </div>
                      <div className="public-americano-match__teams">
                        <strong>
                          {m.teamA[0].name} / {m.teamA[1].name}
                        </strong>
                        {" vs "}
                        <strong>
                          {m.teamB[0].name} / {m.teamB[1].name}
                        </strong>
                      </div>
                      <div className="public-americano-match__score">
                        {typeof m.scoreA === "number" &&
                        typeof m.scoreB === "number"
                          ? `${m.scoreA} — ${m.scoreB}`
                          : "Marcador pendiente"}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          {showFinishedPodium && (
            <section
              className="public-americano-view__section"
              aria-label="Podio final"
            >
                <p className="public-americano-view__finished-line">
                  Torneo finalizado
                </p>
                <h2 className="public-americano-view__podium-title">
                  Felicidades a los 3 primeros lugares
                </h2>
                <div className="public-americano-view__podium-grid">
                  {snapshot.ranking[0] && (
                    <article className="public-americano-view__podium-card public-americano-view__podium-card--gold">
                      <span className="public-americano-view__podium-place">
                        1er lugar
                      </span>
                      <strong>{snapshot.ranking[0].name}</strong>
                    </article>
                  )}
                  {snapshot.ranking[1] && (
                    <article className="public-americano-view__podium-card public-americano-view__podium-card--silver">
                      <span className="public-americano-view__podium-place">
                        2do lugar
                      </span>
                      <strong>{snapshot.ranking[1].name}</strong>
                    </article>
                  )}
                  {snapshot.ranking[2] && (
                    <article className="public-americano-view__podium-card public-americano-view__podium-card--bronze">
                      <span className="public-americano-view__podium-place">
                        3er lugar
                      </span>
                      <strong>{snapshot.ranking[2].name}</strong>
                    </article>
                  )}
                </div>
            </section>
          )}

          {snapshot.ranking.length > 0 && (
            <section className="public-americano-view__section">
              <h2>Clasificación (publicada)</h2>
              <table className="public-americano-view__ranking">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Juegos a favor</th>
                    <th>Juegos en contra</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.ranking.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td>{p.name}</td>
                      <td>{p.stats.pointsFor}</td>
                      <td>{p.stats.pointsAgainst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PublicAmericanoView;
