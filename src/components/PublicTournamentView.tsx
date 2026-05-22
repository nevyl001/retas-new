import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getMatches, getPairs, getTournamentGames, getTournamentByIdPublic, getTournamentPublicConfig } from "../lib/database";
import { Match, Pair, Game, Tournament } from "../lib/database";
import {
  computePairsWithStats,
  computeTeamStandings,
  resolvePublicStandingsTeamConfig,
  sortPairsForStandings,
} from "../lib/standingsUtils";
import type { TeamConfig } from "./RealTimeStandingsTable";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "./TournamentWinnerCalculator";
import {
  RIVIERA_APP_DISPLAY,
  RIVIERA_PUBLIC_DESCRIPTION,
} from "../lib/rivieraBranding";
import { PublicTorneoExpressShell } from "./torneo-express/public/PublicTorneoExpressShell";
import { PublicRetaMatchCard } from "./public/PublicRetaMatchCard";
import {
  PublicRetaStandingsSection,
  type PublicRetaStandingRow,
} from "./public/PublicRetaStandingsSection";
import { PublicRetaRestingPairsSection } from "./public/PublicRetaRestingPairsSection";
import { PublicRetaWinnerSection } from "./public/PublicRetaWinnerSection";
import "./public/riviera-public-americano.css";

interface PublicTournamentViewProps {
  tournamentId: string;
}

/** Parsea team config desde el hash de la URL (#teams=...) para que móvil muestre tabla por equipos aunque falle la API */
function parseTeamConfigFromHash(): TeamConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = window.location.hash.slice(1);
    const match = hash.match(/^teams=(.+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as TeamConfig).teamNames) || !(parsed as TeamConfig).pairToTeam || typeof (parsed as TeamConfig).pairToTeam !== "object") return null;
    const cfg = parsed as TeamConfig;
    if (!cfg.teamNames.length || !Object.keys(cfg.pairToTeam).length) return null;
    return cfg;
  } catch {
    return null;
  }
}

const PublicTournamentView: React.FC<PublicTournamentViewProps> = ({
  tournamentId,
}) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(parseTeamConfigFromHash);
  const [winningTeamName, setWinningTeamName] = useState<string | null>(null);
  const [publicTournamentName, setPublicTournamentName] = useState<string | null>(null);
  const [publicTournamentDescription, setPublicTournamentDescription] = useState<
    string | null
  >(null);
  const configFetchOnDemandRef = useRef(false);

  const loadTournamentData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setError(""); // Limpiar errores previos

      // 1) Config pública (solo existe fila con team_config cuando el torneo es por equipos)
      const publicConfig = await getTournamentPublicConfig(tournamentId);
      const configFromPublic =
        publicConfig?.team_config?.teamNames?.length &&
        publicConfig?.team_config?.pairToTeam &&
        Object.keys(publicConfig.team_config.pairToTeam).length > 0
          ? publicConfig.team_config
          : null;

      const [matchesData, pairsData, gamesData, tournament] = await Promise.all([
        getMatches(tournamentId),
        getPairs(tournamentId),
        getTournamentGames(tournamentId),
        getTournamentByIdPublic(tournamentId),
      ]);

      const hashTeamConfig = parseTeamConfigFromHash();
      const resolvedTeamConfig = resolvePublicStandingsTeamConfig(
        tournament,
        configFromPublic,
        tournamentId,
        hashTeamConfig
      );
      setTeamConfig(resolvedTeamConfig);

      setPublicTournamentName(
        tournament && typeof (tournament as { name?: string }).name === "string"
          ? (tournament as { name: string }).name
          : null
      );
      const t = tournament as Tournament | null | undefined;
      const rawDesc =
        t?.description && typeof t.description === "string"
          ? t.description.trim()
          : "";
      const nameNorm = (t?.name || "").trim();
      setPublicTournamentDescription(
        rawDesc && rawDesc !== nameNorm ? rawDesc : null
      );
      setMatches(matchesData);
      setPairs(pairsData);
      setGames(gamesData || []);
      setLastUpdate(new Date());

      console.log("🔄 Vista pública actualizada:", new Date().toLocaleTimeString());

      const finishedMatches = matchesData.filter((m) => m.status === "finished");
      const totalMatches = matchesData.length;
      const allFinished = finishedMatches.length === totalMatches && totalMatches > 0;

      if (!allFinished) {
        setShowWinner(false);
        setWinningTeamName(null);
        setTournamentWinner(null);
      } else {
        if (resolvedTeamConfig) {
          const pairsWithStats = computePairsWithStats(pairsData, matchesData, gamesData || []);
          const standings = computeTeamStandings(pairsWithStats, resolvedTeamConfig);
          setWinningTeamName(standings?.[0]?.name ?? null);
          setTournamentWinner(null);
          setShowWinner(true);
        } else {
          setWinningTeamName(null);
          try {
            const winner = await TournamentWinnerCalculator.calculateTournamentWinner(
              pairsData,
              matchesData
            );
            setTournamentWinner(winner);
            setShowWinner(true);
          } catch (err) {
            console.error("Error calculating winner:", err);
          }
        }
      }
    } catch (err) {
      setError("Error al cargar los datos de la reta");
      console.error("Error loading tournament data:", err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // Suscripción en tiempo real (con polling como fallback)
  // IMPORTANTE: Debe ir DESPUÉS de la definición de loadTournamentData
  useRealtimeSubscription({
    tournamentId,
    onUpdate: loadTournamentData,
    enabled: true,
  });

  // Cargar teamConfig desde config pública (anon) lo antes posible
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    getTournamentPublicConfig(tournamentId)
      .then((c) => { if (!cancelled && c?.team_config?.teamNames?.length && c?.team_config?.pairToTeam) setTeamConfig(c.team_config); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tournamentId]);

  // Reintentos para config pública (móvil: red más lenta; torneo ya configurado por equipos)
  useEffect(() => {
    if (!tournamentId || pairs.length === 0) return;
    let cancelled = false;
    const delays = [0, 400, 1000, 2000, 3500];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    delays.forEach((delay) => {
      const t = setTimeout(() => {
        getTournamentPublicConfig(tournamentId).then((c) => {
          if (cancelled) return;
          if (c?.team_config?.teamNames?.length && c?.team_config?.pairToTeam)
            setTeamConfig(c.team_config);
        }).catch(() => {});
      }, delay);
      timeouts.push(t);
    });
    return () => { cancelled = true; timeouts.forEach(clearTimeout); };
  }, [tournamentId, pairs.length]);

  // Una vez más al renderizar: si hay parejas y aún no hay config (móvil), intentar cargar config por si la primera petición falló
  useEffect(() => {
    if (!tournamentId || pairs.length === 0 || teamConfig || configFetchOnDemandRef.current) return;
    configFetchOnDemandRef.current = true;
    getTournamentPublicConfig(tournamentId).then((c) => {
      if (c?.team_config?.teamNames?.length && c?.team_config?.pairToTeam)
        setTeamConfig(c.team_config);
    }).catch(() => {});
  }, [tournamentId, pairs.length, teamConfig]);

  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    loadTournamentData();

    const interval = setInterval(() => {
      loadTournamentData();
    }, 60000);
    return () => clearInterval(interval);
  }, [tournamentId, loadTournamentData]);

  const getPairName = (pairId: string) => {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return "Pareja no encontrada";
    return `${pair.player1?.name || "Jugador 1"} / ${
      pair.player2?.name || "Jugador 2"
    }`;
  };

  const getMatchResult = (matchId: string) => {
    const matchGames = games.filter((game) => game.match_id === matchId);

    if (matchGames.length === 0) {
      return { pair1Score: 0, pair2Score: 0, hasResult: false };
    }

    const lastGame = matchGames[matchGames.length - 1];

    return {
      pair1Score: lastGame.pair1_games || 0,
      pair2Score: lastGame.pair2_games || 0,
      hasResult: true,
    };
  };

  // Clasificación por equipos solo si hay team_config real (reta por equipos); si no, tabla por parejas (round robin).
  const pairsWithStats = useMemo(
    () => computePairsWithStats(pairs, matches, games),
    [pairs, matches, games]
  );
  const teamStandings = useMemo(() => {
    if (!teamConfig?.teamNames?.length || !teamConfig.pairToTeam || Object.keys(teamConfig.pairToTeam).length === 0)
      return null;
    return computeTeamStandings(pairsWithStats, teamConfig);
  }, [teamConfig, pairsWithStats]);
  const sortedPairs = useMemo(
    () => sortPairsForStandings(pairsWithStats, matches, games),
    [pairsWithStats, matches, games]
  );

  const standingRows = useMemo((): PublicRetaStandingRow[] => {
    if (teamStandings && teamStandings.length > 0) {
      return teamStandings.map((row) => ({
        id: `team-${row.teamIndex}`,
        name: row.name,
        pj: row.matchesPlayed,
        pg: row.pg,
        pp: row.pp,
        fav: row.points,
        con: row.pointsReceived,
        pts: row.puntosTorneo,
      }));
    }
    return sortedPairs.map((pair) => ({
      id: pair.id,
      name: `${pair.player1_name} / ${pair.player2_name}`,
      pj: pair.matchesPlayed,
      pg: pair.pg,
      pp: pair.pp,
      fav: pair.points,
      con: pair.pointsReceived,
      pts: pair.puntosTorneo,
    }));
  }, [teamStandings, sortedPairs]);

  const formatKicker = teamStandings?.length
    ? "Reta por equipos"
    : "Round Robin";

  useEffect(() => {
    const defaultTitle = `${RIVIERA_APP_DISPLAY} — Retas y torneos de pádel`;
    document.title = publicTournamentName
      ? `${publicTournamentName} · ${RIVIERA_APP_DISPLAY}`
      : defaultTitle;
    return () => {
      document.title = defaultTitle;
    };
  }, [publicTournamentName]);

  if (loading) {
    return (
      <PublicTorneoExpressShell className="te-public--reta">
        <div className="te-public-loading">
          <div className="te-public-loading__pulse" aria-hidden />
          <p>Cargando resultados de la reta…</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (error) {
    return (
      <PublicTorneoExpressShell className="te-public--reta">
        <p className="te-public-error">{error}</p>
      </PublicTorneoExpressShell>
    );
  }

  // Agrupar partidos por ronda
  const matchesByRound = matches.reduce((acc, match) => {
    const round = match.round || 1; // Usar la ronda del match o default a 1
    if (!acc[round]) {
      acc[round] = [];
    }
    acc[round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  // Calcular número de canchas desde los matches (el court más alto)
  const courts = matches.length > 0 
    ? Math.max(...matches.map(m => m.court || 1))
    : 1;

  return (
    <PublicTorneoExpressShell className="te-public--reta">
      <header className="te-public-header te-pub-fade-in">
        <div className="te-public-header__brand">
          <p className="te-public-header__kicker">{formatKicker}</p>
          <h1 className="te-public-header__title">
            {publicTournamentName || "Resultados en tiempo real"}
          </h1>
          <div className="te-public-header__line" aria-hidden />
          <div className="te-public-header__meta">
            {publicTournamentDescription ? (
              <span className="te-public-header__grupo-pill">
                {publicTournamentDescription}
              </span>
            ) : null}
            <span className="te-public-header__subtitle">
              {RIVIERA_PUBLIC_DESCRIPTION}
            </span>
          </div>
        </div>
      </header>

      <section className="te-public-section te-pub-fade-in">
        <h2 className="te-public-section__title">Partidos por ronda</h2>
        <div className="te-public-section__divider" aria-hidden />

        {Object.keys(matchesByRound)
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
          .map((roundKey, roundIdx) => {
            const roundNum = parseInt(roundKey, 10);
            const roundMatches = matchesByRound[roundNum];
            const roundInProgress = roundMatches.some(
              (m) => m.status !== "finished"
            );

            return (
              <div
                key={roundKey}
                className="te-public-round-block te-pub-fade-in-up"
                style={{ animationDelay: `${0.05 + roundIdx * 0.06}s` }}
              >
                <div className="te-public-round-head">
                  <h3 className="te-public-round-head__title">
                    <span className="te-public-round-head__num">
                      Ronda {roundNum}
                    </span>
                    {publicTournamentDescription ? (
                      <>
                        <span className="te-public-round-head__sep">·</span>
                        <span className="te-public-round-head__phase">
                          {publicTournamentDescription}
                        </span>
                      </>
                    ) : null}
                    {roundInProgress ? (
                      <span className="te-public-round-head__live">
                        <span className="te-pub-status__dot" aria-hidden />
                        en curso
                      </span>
                    ) : null}
                  </h3>
                </div>

                <div className="te-pub-matches-grid">
                  {roundMatches.map((match, matchIdx) => {
                    const result = getMatchResult(match.id);
                    const pair1Won =
                      result.hasResult && result.pair1Score > result.pair2Score;
                    const pair2Won =
                      result.hasResult && result.pair2Score > result.pair1Score;
                    const matchGames = games
                      .filter((game) => game.match_id === match.id)
                      .map((game) => ({
                        id: game.id,
                        pair1: game.pair1_games || 0,
                        pair2: game.pair2_games || 0,
                      }));

                    let winnerLabel: string | null = null;
                    if (
                      match.status === "finished" &&
                      result.hasResult &&
                      (pair1Won || pair2Won)
                    ) {
                      winnerLabel = pair1Won
                        ? getPairName(match.pair1_id)
                        : getPairName(match.pair2_id);
                    }

                    return (
                      <PublicRetaMatchCard
                        key={match.id}
                        pair1Label={getPairName(match.pair1_id)}
                        pair2Label={getPairName(match.pair2_id)}
                        score1={result.hasResult ? result.pair1Score : 0}
                        score2={result.hasResult ? result.pair2Score : 0}
                        hasResult={result.hasResult}
                        court={match.court || 1}
                        status={
                          match.status === "finished" ? "finished" : "active"
                        }
                        live={match.status !== "finished"}
                        index={matchIdx}
                        winnerLabel={winnerLabel}
                        games={matchGames.length > 0 ? matchGames : undefined}
                      />
                    );
                  })}
                </div>

                <PublicRetaRestingPairsSection
                  pairs={pairs}
                  matches={matches}
                  round={roundNum}
                  courts={courts}
                />
              </div>
            );
          })}
      </section>

      <PublicRetaStandingsSection
        rows={standingRows}
        title="Clasificación"
        entityHeader={teamStandings?.length ? "EQUIPO" : "PAREJA"}
      />

      {showWinner &&
        teamStandings &&
        teamStandings.length > 0 &&
        (winningTeamName || teamStandings[0]?.name) && (
          <PublicRetaWinnerSection
            title={winningTeamName || teamStandings[0]?.name}
            subtitle="Equipo ganador por puntos"
            torneoNombre={publicTournamentName ?? undefined}
          />
        )}

      {showWinner &&
        (!teamStandings || teamStandings.length === 0) &&
        tournamentWinner && (
          <PublicRetaWinnerSection
            title={`${tournamentWinner.pair.player1?.name} / ${tournamentWinner.pair.player2?.name}`}
            torneoNombre={publicTournamentName ?? undefined}
            stats={[
              { value: tournamentWinner.totalSets, label: "Sets ganados" },
              { value: tournamentWinner.matchesPlayed, label: "Partidos jugados" },
              { value: tournamentWinner.totalPoints, label: "Puntos totales" },
              {
                value: `${tournamentWinner.winPercentage.toFixed(1)}%`,
                label: "% victoria",
              },
            ]}
          />
        )}

      <footer className="te-public-sync-footer te-pub-fade-in" aria-live="polite">
        <p className="te-public-sync-footer__line">
          Actualización en tiempo real · Última actualización:{" "}
          {lastUpdate.toLocaleTimeString()}
        </p>
        <p className="te-public-sync-footer__line">
          Vista pública de resultados · solo lectura
        </p>
      </footer>
    </PublicTorneoExpressShell>
  );
};

export default PublicTournamentView;
