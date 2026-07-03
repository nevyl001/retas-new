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
import { resolveAmericanoRankingFromSnapshot } from "../lib/americanoSnapshotRoster";
import { americanoRoundPhaseCaption } from "../lib/americanoPhaseLabels";
import {
  ClubIdentity,
  formatTenantDocumentTitle,
  getPodiumFinalAriaLabel,
  useClubExperience,
  useOrganizerDisplayName,
} from "../club-experience";
import { isPubDsV2Enabled } from "../config/peds";
import { PublicTorneoExpressShell } from "./torneo-express/public/PublicTorneoExpressShell";
import { StatusBadge } from "./platform/StatusBadge";
import { PublicHero } from "./public/peds";
import { resolvePlayerAvatars, resolvePlayerPublicProfiles } from "../lib/rivieraJugadores/publicPlayerAvatars";
import { PublicAmericanoMatchCard } from "./public/PublicAmericanoMatchCard";
import { PublicAmericanoPodiumCard } from "./public/PublicAmericanoPodiumCard";
import { PublicAmericanoStandingsSection } from "./public/PublicAmericanoStandingsSection";
import {
  PublicRivieraCelebrateBrand,
  PublicRivieraCelebrateClosing,
} from "./public/PublicRivieraCelebrateBrand";
import "./public/riviera-public-americano.css";

const POLL_MS = 4000;

interface PublicAmericanoViewProps {
  tournamentId: string;
}

const AmericanoPublicHeader: React.FC<{
  tournamentName: string | null;
  tournamentDescription: string | null;
}> = ({ tournamentName, tournamentDescription }) => {
  const { isClubBranded } = useClubExperience();

  return (
    <header className="te-public-header te-public-header--americano te-pub-fade-in">
      <div className="te-public-header__brand">
        {isClubBranded ? (
          <ClubIdentity
            variant="compact"
            showTagline={false}
            logoSurface="dark"
            wordmarkOnly
            className="te-public-header__club-identity"
          />
        ) : null}
        <p className="te-public-header__kicker">Americano · En vivo</p>
        <h1 className="te-public-header__title te-public-header__title--event">
          {tournamentName || "Torneo Americano"}
        </h1>
        <div className="te-public-header__line" aria-hidden />
        <div className="te-public-header__meta">
          {tournamentDescription ? (
            <span className="te-public-header__categoria-pill te-public-header__categoria-pill--desc">
              {tournamentDescription}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
};

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
  const [tournamentDescription, setTournamentDescription] = useState<
    string | null
  >(null);
  const [tournamentFinished, setTournamentFinished] = useState(false);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [organizadorId, setOrganizadorId] = useState<string | null>(null);
  const [podiumAvatars, setPodiumAvatars] = useState<
    Record<string, string | null>
  >({});
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>(
    {}
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastMergedFetchRef =
    React.useRef<FetchAmericanoLivePublicResult | null>(null);
  const organizerName = useOrganizerDisplayName(organizadorId ?? undefined);
  const { isClubBranded } = useClubExperience();

  useEffect(() => {
    lastMergedFetchRef.current = null;
    setFetchStatus(null);
    setSnapshot(null);
    setTournamentName(null);
    setTournamentDescription(null);
    setTournamentFinished(false);
    setTournamentStarted(false);
    setLoadError(null);
  }, [tournamentId]);

  useEffect(() => {
    const defaultTitle = formatTenantDocumentTitle(
      null,
      organizerName,
      "Americano en vivo"
    );
    document.title = formatTenantDocumentTitle(
      tournamentName,
      organizerName,
      "Americano en vivo"
    );
    return () => {
      document.title = defaultTitle;
    };
  }, [tournamentName, organizerName]);

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
      const desc =
        typeof tournament?.description === "string"
          ? tournament.description.trim()
          : "";
      setTournamentDescription(desc || null);
      setTournamentFinished(!!tournament?.is_finished);
      setTournamentStarted(!!tournament?.is_started);
      const orgId =
        typeof tournament?.user_id === "string" ? tournament.user_id : null;
      setOrganizadorId(orgId);
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

  const rankedRows = React.useMemo(
    () => (snapshot ? resolveAmericanoRankingFromSnapshot(snapshot) : []),
    [snapshot]
  );

  const showFinishedPodium =
    rankedRows.length > 0 &&
    !!snapshot &&
    (snapshot.tournamentPhase === "finished" || tournamentFinished);

  const podiumPlayers = React.useMemo(
    () => rankedRows.slice(0, 3),
    [rankedRows]
  );

  const snapshotPlayerEntries = React.useMemo(() => {
    if (!snapshot) return [];
    const seen = new Set<string>();
    const entries: { id: string; name: string }[] = [];
    const add = (id: string, name: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      entries.push({ id, name });
    };
    for (const round of snapshot.rounds) {
      for (const m of round.matches) {
        add(m.teamA[0].id, m.teamA[0].name);
        add(m.teamA[1].id, m.teamA[1].name);
        add(m.teamB[0].id, m.teamB[0].name);
        add(m.teamB[1].id, m.teamB[1].name);
      }
      for (const p of round.benchPlayers) {
        add(p.id, p.name);
      }
    }
    return entries;
  }, [snapshot]);

  useEffect(() => {
    if (!organizadorId || snapshotPlayerEntries.length === 0) {
      setPlayerRatings({});
      return;
    }
    let cancelled = false;
    void resolvePlayerPublicProfiles(organizadorId, snapshotPlayerEntries, {
      publicOnly: true,
    }).then((profiles) => {
      if (cancelled) return;
      const ratings: Record<string, number> = {};
      for (const e of snapshotPlayerEntries) {
        ratings[e.id] = profiles[e.id]?.rating ?? 3;
      }
      setPlayerRatings(ratings);
    });
    return () => {
      cancelled = true;
    };
  }, [organizadorId, snapshotPlayerEntries]);

  useEffect(() => {
    if (!organizadorId || podiumPlayers.length === 0) {
      setPodiumAvatars({});
      return;
    }
    let cancelled = false;
    void resolvePlayerAvatars(
      organizadorId,
      podiumPlayers.map((p) => ({ id: p.id, name: p.name })),
      { publicOnly: true }
    ).then((map) => {
      if (!cancelled) setPodiumAvatars(map);
    });
    return () => {
      cancelled = true;
    };
  }, [organizadorId, podiumPlayers]);

  return (
    <PublicTorneoExpressShell
      className="te-public--americano te-public--americano-wide"
      organizadorId={organizadorId}
    >
      {isPubDsV2Enabled ? (
        <PublicHero
          logoClub={
            isClubBranded ? (
              <ClubIdentity
                variant="compact"
                showTagline={false}
                logoSurface="dark"
                wordmarkOnly
                className="peds-hero__club-identity"
              />
            ) : undefined
          }
          estado={<StatusBadge variant="live">En vivo</StatusBadge>}
          nombreEvento={tournamentName || "Torneo Americano"}
          club={organizerName}
          categoria={tournamentDescription}
          meta="Americano"
        />
      ) : (
        <AmericanoPublicHeader
          tournamentName={tournamentName}
          tournamentDescription={tournamentDescription}
        />
      )}

      {loadError && (
        <div className="te-public-error te-public-error-block te-pub-fade-in">
          {loadError}
        </div>
      )}

      {!loadError &&
        fetchStatus?.status === "missing_column" &&
        !snapshot && (
          <div className="te-public-error te-public-error-block te-pub-fade-in">
            <p>
              <strong>
                No se puede mostrar el Americano en vivo desde internet.
              </strong>
            </p>
            <p className="te-public-empty">
              En móvil (y en cualquier otro dispositivo) esta pantalla solo lee
              datos guardados en <strong>Supabase</strong>, no el navegador del
              organizador.
            </p>
            <p className="te-public-empty">
              Falta la columna <code>americano_live</code> en la tabla{" "}
              <code>tournament_public_config</code> (Supabase). Añádela en el
              esquema y vuelve a abrir el Americano en el móvil del organizador
              unos segundos para que se publique el marcador.
            </p>
          </div>
        )}

      {!loadError &&
        fetchStatus?.status === "fetch_error" &&
        !snapshot && (
          <div className="te-public-error te-public-error-block te-pub-fade-in">
            <p>
              <strong>No se pudo leer la publicación.</strong>{" "}
              {fetchStatus.message}
            </p>
            <p className="te-public-empty">
              Revisa la URL del proyecto Supabase, la tabla{" "}
              <code>tournament_public_config</code> y las políticas RLS (debe
              permitir <code>SELECT</code> a <code>anon</code>).
            </p>
          </div>
        )}

      {!loadError &&
        fetchStatus?.status === "empty" &&
        !snapshot && (
          <section className="te-public-section te-pub-fade-in">
            <p className="te-public-empty">
              <strong>Aún no hay datos publicados</strong> para este torneo en
              internet.
            </p>
            <p className="te-public-empty">
              La vista pública <strong>no</strong> lee el mismo móvil u ordenador
              del organizador: solo muestra lo que esté guardado en la nube
              (Supabase).
            </p>
            {tournamentStarted ? (
              <p className="te-public-empty">
                Esta reta consta como <strong>iniciada</strong>, pero no hay
                marcador publicado. Si ya ejecutaste el torneo, revisa en
                Supabase la columna <code>americano_live</code> y en el
                dispositivo del organizador la consola por errores de{" "}
                <code>upsert</code> (sesión cerrada o permisos RLS).
              </p>
            ) : (
              <p className="te-public-empty">
                El organizador debe tener abierto el Americano de esta reta (URL
                con <code>?tournamentId=…</code>), pulsar{" "}
                <strong>Iniciar torneo</strong> y esperar unos segundos a que se
                suba el estado.
              </p>
            )}
          </section>
        )}

      {snapshot && (
        <>
          {snapshot.rounds.length > 0 &&
            snapshot.rounds.map((round, roundIdx) => {
              const isLastRound = roundIdx === snapshot.rounds.length - 1;
              const inProgress = isLastRound && !roundFullyScored(round);
              const matches = roundMatchesSorted(round);
              const phaseCaption = americanoRoundPhaseCaption(
                round,
                totalForPhaseLabels
              );

              return (
                <section
                  key={`${round.roundNumber}-${round.phase}-${roundIdx}`}
                  className="te-public-section te-pub-fade-in"
                  style={{ animationDelay: `${0.05 + roundIdx * 0.06}s` }}
                >
                  <div className="te-public-round-head">
                    <h2 className="te-public-round-head__title">
                      <span className="te-public-round-head__num">
                        Ronda {round.roundNumber}
                      </span>
                      {phaseCaption ? (
                        <>
                          <span className="te-public-round-head__sep">·</span>
                          <span className="te-public-round-head__phase">
                            {phaseCaption}
                          </span>
                        </>
                      ) : null}
                      {inProgress && (
                        <span className="te-public-round-head__live">
                          <span className="te-pub-status__dot" aria-hidden />
                          en curso
                        </span>
                      )}
                    </h2>
                  </div>
                  <div className="te-public-section__divider" aria-hidden />

                  {round.benchPlayers.length > 0 && (
                    <p className="te-public-bench">
                      <strong>Descansan:</strong>{" "}
                      {round.benchPlayers.map((p) => p.name).join(", ")}
                    </p>
                  )}

                  <div className="te-pub-matches-grid te-pub-matches-grid--wide">
                    {matches.map((m, matchIdx) => (
                      <PublicAmericanoMatchCard
                        key={m.id}
                        match={m}
                        live={inProgress}
                        index={matchIdx}
                        playerRatings={playerRatings}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

          {showFinishedPodium && (
            <section
              className="te-public-section ro-pub-celebrate ro-pub-celebrate--podium te-pub-fade-in"
              aria-label={getPodiumFinalAriaLabel(organizerName)}
            >
              <div className="ro-pub-celebrate__inner">
                <PublicRivieraCelebrateBrand />
                <div className="ro-divider-gold" aria-hidden />
                <h2 className="ro-pub-celebrate__headline">¡Felicidades!</h2>
                <p className="te-public-podium__badge">Americano finalizado</p>
                <h3 className="te-public-podium__title">
                  Los 3 primeros lugares
                </h3>
                <p className="ro-pub-celebrate__motivational">
                  Así se juega en Riviera.
                </p>
                <div className="te-public-podium__grid">
                  {rankedRows[0] && (
                    <PublicAmericanoPodiumCard
                      rank={1}
                      name={rankedRows[0].name}
                      fotoUrl={podiumAvatars[rankedRows[0].id]}
                    />
                  )}
                  {rankedRows[1] && (
                    <PublicAmericanoPodiumCard
                      rank={2}
                      name={rankedRows[1].name}
                      fotoUrl={podiumAvatars[rankedRows[1].id]}
                      animationDelay="0.08s"
                    />
                  )}
                  {rankedRows[2] && (
                    <PublicAmericanoPodiumCard
                      rank={3}
                      name={rankedRows[2].name}
                      fotoUrl={podiumAvatars[rankedRows[2].id]}
                      animationDelay="0.12s"
                    />
                  )}
                </div>
                <PublicRivieraCelebrateClosing
                  torneoNombre={tournamentName ?? undefined}
                />
              </div>
            </section>
          )}

          {rankedRows.length > 0 && (
            <PublicAmericanoStandingsSection
              rows={rankedRows}
              title="Clasificación"
            />
          )}
        </>
      )}

      <footer className="te-public-sync-footer te-pub-fade-in" aria-live="polite">
        <p className="te-public-sync-footer__line">
          {snapshot?.savedAt ? (
            <>
              Actualización en tiempo real · Última actualización:{" "}
              {new Date(snapshot.savedAt).toLocaleString()}
            </>
          ) : (
            "Actualización en tiempo real"
          )}
        </p>
      </footer>
    </PublicTorneoExpressShell>
  );
};

export default PublicAmericanoView;
