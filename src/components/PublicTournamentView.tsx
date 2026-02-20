import React, { useState, useEffect, useCallback } from "react";
import "./PublicTournamentView.css";
import { getMatches, getPairs, getTournamentGames, getTournamentById } from "../lib/database";
import { Match, Pair, Game } from "../lib/database";
import { getTeamConfigFromStorage, computePairsWithStats, computeTeamStandings } from "../lib/standingsUtils";
import type { TeamConfig } from "./RealTimeStandingsTable";
import RealTimeStandingsTable from "./RealTimeStandingsTable";
import RestingPairsSection from "./RestingPairsSection";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "./TournamentWinnerCalculator";

interface PublicTournamentViewProps {
  tournamentId: string;
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
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(null);
  const [winningTeamName, setWinningTeamName] = useState<string | null>(null);

  const loadTournamentData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setError(""); // Limpiar errores previos

      const [matchesData, pairsData, gamesData, tournament] = await Promise.all([
        getMatches(tournamentId),
        getPairs(tournamentId),
        getTournamentGames(tournamentId),
        getTournamentById(tournamentId),
      ]);

      const config =
        tournament?.format === "teams" &&
        tournament?.team_config?.teamNames?.length &&
        tournament?.team_config?.pairToTeam
          ? tournament.team_config
          : getTeamConfigFromStorage(tournamentId);
      setTeamConfig(config || null);

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
      } else if (config) {
        const pairsWithStats = computePairsWithStats(pairsData, matchesData, gamesData || []);
        const teamStandings = computeTeamStandings(pairsWithStats, config);
        setWinningTeamName(teamStandings?.[0]?.name ?? null);
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

  // Obtener teamConfig lo antes posible (sobre todo en móvil) para que la tabla muestre equipos desde el primer render
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    getTournamentById(tournamentId)
      .then((t) => {
        if (cancelled) return;
        const config =
          t?.format === "teams" &&
          t?.team_config?.teamNames?.length &&
          t?.team_config?.pairToTeam
            ? t.team_config
            : getTeamConfigFromStorage(tournamentId);
        if (config) setTeamConfig(config);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tournamentId]);

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

    // Obtener el último juego (el más reciente) para mostrar el marcador actual
    const lastGame = matchGames[matchGames.length - 1];

    return {
      pair1Score: lastGame.pair1_games || 0,
      pair2Score: lastGame.pair2_games || 0,
      hasResult: true,
    };
  };

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
                              {getPairName(match.pair1_id)}
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
                              {getPairName(match.pair2_id)}
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
                              <span className="elegant-winner-text">
                                Ganador:{" "}
                                {pair1Won
                                  ? getPairName(match.pair1_id)
                                  : pair2Won
                                  ? getPairName(match.pair2_id)
                                  : "Empate"}
                              </span>
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
                              {getPairName(match.pair1_id)}
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
                              {getPairName(match.pair2_id)}
                            </div>
                            <div className="mobile-team-score">
                              {result.hasResult ? result.pair2Score : 0}
                            </div>
                          </div>
                        </div>

                        {/* Ganador móvil */}
                        {match.status === "finished" && result.hasResult && (
                          <div className="mobile-winner">
                            🏆{" "}
                            {pair1Won
                              ? getPairName(match.pair1_id)
                              : pair2Won
                              ? getPairName(match.pair2_id)
                              : "Empate"}
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

      {/* Tabla de Clasificación (por equipos si la reta es por equipos) */}
      <div className="public-standings-section">
        <RealTimeStandingsTable tournamentId={tournamentId} forceRefresh={0} teamConfig={teamConfig} />
      </div>

      {/* Sección del Ganador: por equipos = equipo ganador; round robin = pareja ganadora */}
      {showWinner && winningTeamName && (
        <div className="public-winner-section">
          <div className="public-winner-header">
            <h2 className="public-winner-title">🏆 EQUIPO GANADOR 🏆</h2>
          </div>
          <div className="public-winner-content">
            <div className="public-winner-names">{winningTeamName}</div>
            <div className="public-winner-subtitle">
              Equipo que más puntos acumuló en la reta
            </div>
          </div>
        </div>
      )}
      {showWinner && !winningTeamName && tournamentWinner && (
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
