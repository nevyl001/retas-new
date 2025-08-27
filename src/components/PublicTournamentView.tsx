import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    loadTournamentData();
    // Auto-refresh cada 30 segundos
    const interval = setInterval(loadTournamentData, 30000);
    return () => clearInterval(interval);
  }, [tournamentId]);

  const loadTournamentData = async () => {
    try {
      // Solo mostrar loading en la primera carga, no en refreshes
      if (matches.length === 0) setLoading(true);

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

      // Verificar si el torneo está terminado y calcular ganador
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
      setError("Error al cargar los datos del torneo");
      console.error("Error loading tournament data:", err);
    } finally {
      setLoading(false);
    }
  };

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
        <p>Cargando resultados del torneo...</p>
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
                    <div key={match.id} className="public-match-card">
                      <div className="public-match-header">
                        <div className="public-match-title">
                          Cancha {match.court}
                        </div>
                        <div className="public-match-status">
                          {match.status === "finished"
                            ? "✅ Finalizado"
                            : "🔄 En curso"}
                        </div>
                      </div>

                      <div className="public-match-content">
                        {/* Pareja 1 */}
                        <div
                          className={`public-pair-info ${
                            pair1Won ? "winner" : ""
                          }`}
                        >
                          <span
                            className={`public-pair-names ${
                              pair1Won ? "winner" : ""
                            }`}
                          >
                            {getPairName(match.pair1_id)}
                          </span>
                        </div>

                        {/* Resultado en el centro */}
                        {result.hasResult ? (
                          <div className="public-match-result">
                            <div className="public-result-score">
                              <span
                                className={`public-score-pair1 ${
                                  pair1Won ? "winner" : ""
                                }`}
                              >
                                {result.pair1Score}
                              </span>
                              <span className="public-score-separator">-</span>
                              <span
                                className={`public-score-pair2 ${
                                  pair2Won ? "winner" : ""
                                }`}
                              >
                                {result.pair2Score}
                              </span>
                            </div>
                            <div className="public-result-label">
                              {match.status === "finished"
                                ? "Final"
                                : "En curso"}
                            </div>
                          </div>
                        ) : (
                          <div className="public-match-result">
                            <div className="public-result-score">
                              <span className="public-score-pair1">0</span>
                              <span className="public-score-separator">-</span>
                              <span className="public-score-pair2">0</span>
                            </div>
                            <div className="public-result-label">
                              Sin comenzar
                            </div>
                          </div>
                        )}

                        {/* Pareja 2 */}
                        <div
                          className={`public-pair-info ${
                            pair2Won ? "winner" : ""
                          }`}
                        >
                          <span
                            className={`public-pair-names ${
                              pair2Won ? "winner" : ""
                            }`}
                          >
                            {getPairName(match.pair2_id)}
                          </span>
                        </div>
                      </div>
                    </div>
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
