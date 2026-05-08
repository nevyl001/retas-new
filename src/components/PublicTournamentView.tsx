import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import "./PublicTournamentView.css";
import "./ModernStandingsTable.css";
import { getMatches, getPairs, getTournamentGames, getTournamentById, getTournamentPublicConfig } from "../lib/database";
import { Match, Pair, Game } from "../lib/database";
import {
  computePairsWithStats,
  computeTeamStandings,
  resolvePublicStandingsTeamConfig,
} from "../lib/standingsUtils";
import type { TeamConfig } from "./RealTimeStandingsTable";
import RestingPairsSection from "./RestingPairsSection";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "./TournamentWinnerCalculator";

interface PublicTournamentViewProps {
  tournamentId: string;
}

/** Divide "A / B" en dos líneas para que no parta nombres al azar en el wrap. */
function splitPairDisplayName(full: string): { a: string; b: string } | null {
  const sep = " / ";
  const i = full.indexOf(sep);
  if (i === -1) return null;
  const a = full.slice(0, i).trim();
  const b = full.slice(i + sep.length).trim();
  if (!a || !b) return null;
  return { a, b };
}

/** Nombres de pareja en vista pública: dos líneas + barra, tipografía adaptable. */
function PublicPairNameStack({
  label,
  variant = "card",
}: {
  label: string;
  variant?: "card" | "winner" | "mobile";
}) {
  const split = splitPairDisplayName(label);
  if (!split) {
    return (
      <span
        className={`public-pair-name-stack public-pair-name-stack--${variant} public-pair-name-single`}
      >
        {label}
      </span>
    );
  }
  return (
    <span className={`public-pair-name-stack public-pair-name-stack--${variant}`}>
      <span className="public-pair-name-line">{split.a}</span>
      <span className="public-pair-name-sep" aria-hidden="true">
        /
      </span>
      <span className="public-pair-name-line">{split.b}</span>
    </span>
  );
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
        getTournamentById(tournamentId),
      ]);

      const hashTeamConfig = parseTeamConfigFromHash();
      const resolvedTeamConfig = resolvePublicStandingsTeamConfig(
        tournament,
        configFromPublic,
        tournamentId,
        hashTeamConfig
      );
      setTeamConfig(resolvedTeamConfig);

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
  const sortedPairs = useMemo(() => {
    return [...pairsWithStats].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
      if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
      return `${a.player1_name}/${a.player2_name}`.localeCompare(`${b.player1_name}/${b.player2_name}`);
    });
  }, [pairsWithStats]);

  const getPositionIcon = (pos: number) => (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "");

  if (loading) {
    return (
      <div className="public-loading">
        <div className="public-loading-spinner">🏆</div>
        <p>Cargando resultados de la reta...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-error">
        <h3>❌ Error</h3>
        <p>{error}</p>
      </div>
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
    <div className="public-tournament-view">
      {/* Header Público */}
      <div className="public-header">
        <div className="public-header-content">
          <h1 className="public-title">🏆 Resultados en Tiempo Real</h1>
          <p className="public-subtitle">
            Sigue los resultados de tu reta de pádel
          </p>
        </div>
      </div>

      {/* Partidos por Ronda */}
      <div className="public-matches-section">
        <div className="public-matches-header">
          <h2 className="public-matches-title">📋 Partidos por Ronda</h2>
        </div>

        {Object.keys(matchesByRound)
          .sort((a, b) => parseInt(a) - parseInt(b))
          .map((round) => (
            <div key={round} className="public-round-section">
              <div className="public-round-header">
                <h3 className="public-round-title">Ronda {round}</h3>
              </div>

              <div className="public-matches-grid">
                {matchesByRound[parseInt(round)].map((match) => {
                  const result = getMatchResult(match.id);
                  const pair1Won =
                    result.hasResult && result.pair1Score > result.pair2Score;
                  const pair2Won =
                    result.hasResult && result.pair2Score > result.pair1Score;
                  
                  const matchGames = games.filter((game) => game.match_id === match.id);

                  return (
                    <div key={match.id} className="public-match-card-wrapper">
                      {/* Versión Desktop */}
                      <div className="elegant-public-match-card desktop-only">
                        {/* Header con información del partido */}
                        <div className="elegant-public-header">
                          <div className="elegant-match-info-top">
                            <span className="elegant-court-badge">
                              <span className="elegant-court-icon">🏟️</span>
                              Cancha {match.court}
                            </span>
                            <div
                              className={`elegant-match-status ${
                                match.status === "finished"
                                  ? "finished"
                                  : "active"
                              }`}
                            >
                              {match.status === "finished"
                                ? "✅ FINALIZADO"
                                : "🔄 EN PROGRESO"}
                            </div>
                          </div>
                        </div>

                        {/* Diseño del enfrentamiento */}
                        <div className="elegant-vs-layout">
                          {/* Pareja 1 */}
                          <div
                            className={`elegant-player-side left ${
                              pair1Won ? "winner" : ""
                            }`}
                          >
                            <div className="elegant-player-name">
                              <PublicPairNameStack
                                label={getPairName(match.pair1_id)}
                                variant="card"
                              />
                            </div>
                            <div
                              className={`elegant-player-score ${
                                pair1Won ? "winner" : ""
                              }`}
                            >
                              {result.hasResult ? result.pair1Score : 0}
                            </div>
                          </div>

                          {/* Centro VS con animación */}
                          <div className="elegant-vs-center">
                            <div className="elegant-vs-circle">
                              <span className="elegant-vs-label">VS</span>
                            </div>
                            <div className="elegant-score-line"></div>
                          </div>

                          {/* Pareja 2 */}
                          <div
                            className={`elegant-player-side right ${
                              pair2Won ? "winner" : ""
                            }`}
                          >
                            <div className="elegant-player-name">
                              <PublicPairNameStack
                                label={getPairName(match.pair2_id)}
                                variant="card"
                              />
                            </div>
                            <div
                              className={`elegant-player-score ${
                                pair2Won ? "winner" : ""
                              }`}
                            >
                              {result.hasResult ? result.pair2Score : 0}
                            </div>
                          </div>
                        </div>

                        {/* Winner highlight for finished matches */}
                        {match.status === "finished" && result.hasResult && (
                          <div className="elegant-public-winner">
                            <div className="elegant-winner-banner">
                              <span className="elegant-winner-icon">🏆</span>
                              <div className="elegant-winner-body">
                                <span className="elegant-winner-prefix">
                                  Ganador
                                </span>
                                {pair1Won || pair2Won ? (
                                  <PublicPairNameStack
                                    label={
                                      pair1Won
                                        ? getPairName(match.pair1_id)
                                        : getPairName(match.pair2_id)
                                    }
                                    variant="winner"
                                  />
                                ) : (
                                  <span className="elegant-winner-empate">
                                    Empate
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Sección de Juegos */}
                        {matchGames.length > 0 && (
                          <div className="modern-games-results">
                            <h6 className="modern-games-title">📊 Juegos:</h6>
                            <div className="modern-games-grid">
                              {matchGames.map((game, index) => (
                                <div key={game.id} className="modern-game-result">
                                  <span className="modern-game-number">J{index + 1}:</span>
                                  <span className="modern-game-score">
                                    {game.pair1_games}-{game.pair2_games}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Versión Mobile - Diseño completamente diferente */}
                      <div className="mobile-match-card mobile-only">
                        {/* Header compacto */}
                        <div className="mobile-header">
                          <span className="mobile-court">
                            🏟️ Cancha {match.court}
                          </span>
                          <div
                            className={`mobile-status ${
                              match.status === "finished"
                                ? "finished"
                                : "active"
                            }`}
                          >
                            {match.status === "finished" ? "✅" : "🔄"}
                          </div>
                        </div>

                        {/* Enfrentamiento horizontal compacto */}
                        <div className="mobile-match-content">
                          <div
                            className={`mobile-team ${
                              pair1Won ? "winner" : ""
                            }`}
                          >
                            <div className="mobile-team-name">
                              <PublicPairNameStack
                                label={getPairName(match.pair1_id)}
                                variant="mobile"
                              />
                            </div>
                            <div className="mobile-team-score">
                              {result.hasResult ? result.pair1Score : 0}
                            </div>
                          </div>

                          <div className="mobile-vs">VS</div>

                          <div
                            className={`mobile-team ${
                              pair2Won ? "winner" : ""
                            }`}
                          >
                            <div className="mobile-team-name">
                              <PublicPairNameStack
                                label={getPairName(match.pair2_id)}
                                variant="mobile"
                              />
                            </div>
                            <div className="mobile-team-score">
                              {result.hasResult ? result.pair2Score : 0}
                            </div>
                          </div>
                        </div>

                        {/* Ganador móvil */}
                        {match.status === "finished" && result.hasResult && (
                          <div className="mobile-winner">
                            <span className="mobile-winner-icon" aria-hidden>
                              🏆
                            </span>
                            <div className="mobile-winner-inner">
                              <span className="mobile-winner-label">Ganador</span>
                              {pair1Won || pair2Won ? (
                                <PublicPairNameStack
                                  label={
                                    pair1Won
                                      ? getPairName(match.pair1_id)
                                      : getPairName(match.pair2_id)
                                  }
                                  variant="winner"
                                />
                              ) : (
                                <span className="mobile-winner-empate">
                                  Empate
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Sección de Juegos - Móvil */}
                        {matchGames.length > 0 && (
                          <div className="modern-games-results">
                            <h6 className="modern-games-title">📊 Juegos:</h6>
                            <div className="modern-games-grid">
                              {matchGames.map((game, index) => (
                                <div key={game.id} className="modern-game-result">
                                  <span className="modern-game-number">J{index + 1}:</span>
                                  <span className="modern-game-score">
                                    {game.pair1_games}-{game.pair2_games}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Sección de parejas que descansan en esta ronda */}
              <RestingPairsSection
                pairs={pairs}
                matches={matches}
                round={parseInt(round)}
                courts={courts}
              />
            </div>
          ))}
      </div>

      {/* Clasificación: tabla en escritorio, cards en móvil para que se vea bien */}
      <div
        className="public-standings-section"
        data-standings-mode={teamStandings?.length ? "teams" : "pairs"}
      >
        <div className="new-standings-container">
          <div className="new-standings-header">
            <h2>📊 Clasificación</h2>
          </div>

          {/* Versión móvil: cards (se ve bien en pantalla pequeña) */}
          <div className="standings-mobile-cards">
            {teamStandings && teamStandings.length > 0
              ? teamStandings.map((row, index) => (
                  <div
                    key={`team-${row.teamIndex}`}
                    className={`standings-card ${index === 0 ? "standings-card-first" : index === 1 ? "standings-card-second" : index === 2 ? "standings-card-third" : ""}`}
                  >
                    <div className="standings-card-header">
                      <span className="standings-card-pos">{getPositionIcon(index + 1) || index + 1}</span>
                      <span className="standings-card-name">{row.name}</span>
                    </div>
                    <div className="standings-card-stats">
                      <span><strong>{row.setsWon}</strong> Sets</span>
                      <span><strong>{row.matchesPlayed}</strong> Part.</span>
                      <span><strong>{row.points}</strong> Puntos</span>
                    </div>
                  </div>
                ))
              : sortedPairs.map((pair, index) => (
                  <div
                    key={pair.id}
                    className={`standings-card ${index === 0 ? "standings-card-first" : index === 1 ? "standings-card-second" : index === 2 ? "standings-card-third" : ""}`}
                  >
                    <div className="standings-card-header">
                      <span className="standings-card-pos">{getPositionIcon(index + 1) || index + 1}</span>
                      <span className="standings-card-name">{pair.player1_name} / {pair.player2_name}</span>
                    </div>
                    <div className="standings-card-stats">
                      <span><strong>{pair.setsWon}</strong> Sets</span>
                      <span><strong>{pair.matchesPlayed}</strong> Part.</span>
                      <span><strong>{pair.points}</strong> Puntos</span>
                    </div>
                  </div>
                ))}
          </div>

          {/* Versión escritorio: tabla */}
          <div className="standings-desktop-table">
            {teamStandings && teamStandings.length > 0 ? (
              <div className="new-standings-table-wrapper">
                <table className="new-standings-table">
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Equipo</th>
                      <th>Sets</th>
                      <th>Partidos</th>
                      <th>Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStandings.map((row, index) => (
                      <tr
                        key={row.teamIndex}
                        className={
                          index === 0 ? "new-first-place" :
                          index === 1 ? "new-second-place" :
                          index === 2 ? "new-third-place" : "new-normal-place"
                        }
                      >
                        <td className="new-position-cell">
                          <span className="new-position-number">{index + 1}</span>
                          <span className="new-position-icon">{getPositionIcon(index + 1)}</span>
                        </td>
                        <td className="new-team-cell">{row.name}</td>
                        <td className="new-stats-cell">{row.setsWon}</td>
                        <td className="new-stats-cell">{row.matchesPlayed}</td>
                        <td className="new-points-cell">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="new-standings-table-wrapper">
                <table className="new-standings-table">
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Pareja</th>
                      <th>Sets</th>
                      <th>Partidos</th>
                      <th>Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPairs.map((pair, index) => (
                      <tr
                        key={pair.id}
                        className={
                          index === 0 ? "new-first-place" :
                          index === 1 ? "new-second-place" :
                          index === 2 ? "new-third-place" : "new-normal-place"
                        }
                      >
                        <td className="new-position-cell">
                          <span className="new-position-number">{index + 1}</span>
                          <span className="new-position-icon">{getPositionIcon(index + 1)}</span>
                        </td>
                        <td className="new-team-cell">{pair.player1_name} / {pair.player2_name}</td>
                        <td className="new-stats-cell">{pair.setsWon}</td>
                        <td className="new-stats-cell">{pair.matchesPlayed}</td>
                        <td className="new-points-cell">{pair.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sección del Ganador: por equipos = equipo ganador (primero en la tabla); round robin = pareja ganadora */}
      {showWinner && teamStandings && teamStandings.length > 0 && (winningTeamName || teamStandings[0]?.name) && (
        <div className="public-winner-section">
          <div className="public-winner-header">
            <h2 className="public-winner-title">🏆 EQUIPO GANADOR 🏆</h2>
          </div>
          <div className="public-winner-content">
            <div className="public-winner-names">{winningTeamName || teamStandings[0]?.name}</div>
            <div className="public-winner-subtitle">
              Equipo que más puntos acumuló en la reta
            </div>
          </div>
        </div>
      )}
      {/* Solo mostrar ganadores por pareja cuando NO es por equipos (evitar duplicar con equipo ganador) */}
      {showWinner && (!teamStandings || teamStandings.length === 0) && tournamentWinner && (
        <div className="public-winner-section">
          <div className="public-winner-header">
            <h2 className="public-winner-title">🏆 GANADORES DE LA RETA 🏆</h2>
          </div>
          <div className="public-winner-content">
            <div className="public-winner-names">
              {tournamentWinner.pair.player1?.name} /{" "}
              {tournamentWinner.pair.player2?.name}
            </div>
            <div className="public-winner-subtitle">
              ¡Son los campeones de la reta!
            </div>

            <div className="public-winner-stats">
              <div className="public-winner-stat">
                <span className="public-winner-stat-number">
                  {tournamentWinner.totalSets}
                </span>
                <span className="public-winner-stat-label">Sets Ganados</span>
              </div>
              <div className="public-winner-stat">
                <span className="public-winner-stat-number">
                  {tournamentWinner.matchesPlayed}
                </span>
                <span className="public-winner-stat-label">
                  Partidos Jugados
                </span>
              </div>
              <div className="public-winner-stat">
                <span className="public-winner-stat-number">
                  {tournamentWinner.totalPoints}
                </span>
                <span className="public-winner-stat-label">Puntos Totales</span>
              </div>
              <div className="public-winner-stat">
                <span className="public-winner-stat-number">
                  {tournamentWinner.winPercentage.toFixed(1)}%
                </span>
                <span className="public-winner-stat-label">
                  Porcentaje de Victoria
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Público */}
      <div className="public-footer">
        <p className="public-footer-text">
          📱 Actualización en tiempo real - Última actualización:{" "}
          {lastUpdate.toLocaleTimeString()}
        </p>
        <p className="public-footer-note">
          Esta es la vista pública de resultados. Solo lectura.
        </p>
      </div>
    </div>
  );
};

export default PublicTournamentView;
