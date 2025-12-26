import React, { useState, useEffect, useCallback } from "react";
import "./PublicTournamentView.css";
import { getMatches, getPairs, getTournamentGames } from "../lib/database";
import { Match, Pair, Game } from "../lib/database";
import RealTimeStandingsTable from "./RealTimeStandingsTable";
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

  const loadTournamentData = useCallback(async () => {
    try {
      setError(""); // Limpiar errores previos

      const [matchesData, pairsData, gamesData] = await Promise.all([
        getMatches(tournamentId),
        getPairs(tournamentId),
        getTournamentGames(tournamentId),
      ]);

      setMatches(matchesData);
      setPairs(pairsData);
      setGames(gamesData || []); // Asegurar que games siempre sea un array
      setLastUpdate(new Date());

      console.log("🔄 Vista pública actualizada:", new Date().toLocaleTimeString());

      // Verificar si la reta está terminada y calcular ganador
      const finishedMatches = matchesData.filter(
        (match) => match.status === "finished"
      );
      const totalMatches = matchesData.length;

      if (finishedMatches.length === totalMatches && totalMatches > 0) {
        try {
          const winner =
            await TournamentWinnerCalculator.calculateTournamentWinner(
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

  useEffect(() => {
    setLoading(true);
    loadTournamentData();
    
    // Auto-refresh cada 30 segundos
    const interval = setInterval(() => {
      console.log("⏰ Auto-refresh vista pública (30s)");
      loadTournamentData();
    }, 30000);
    
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
                <span className="public-round-count">
                  {matchesByRound[parseInt(round)].length} partidos
                </span>
              </div>

              <div className="public-matches-grid">
                {matchesByRound[parseInt(round)].map((match) => {
                  const result = getMatchResult(match.id);
                  const pair1Won =
                    result.hasResult && result.pair1Score > result.pair2Score;
                  const pair2Won =
                    result.hasResult && result.pair2Score > result.pair1Score;

                  return (
                    <React.Fragment key={match.id}>
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
                            <span className="elegant-round-badge">
                              <span className="elegant-round-icon">🔄</span>
                              Ronda {round}
                            </span>
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
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Tabla de Clasificación */}
      <div className="public-standings-section">
        <div className="public-standings-header">
          <h2 className="public-standings-title">📊 Tabla de Clasificación</h2>
        </div>
        <RealTimeStandingsTable tournamentId={tournamentId} forceRefresh={0} />
      </div>

      {/* Sección del Ganador */}
      {showWinner && tournamentWinner && (
        <div className="public-winner-section">
          <div className="public-winner-header">
            <h2 className="public-winner-title">🏆 ¡GANADOR DE LA RETA! 🏆</h2>
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
          📱 Actualización automática cada 30 segundos - Última actualización:{" "}
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
