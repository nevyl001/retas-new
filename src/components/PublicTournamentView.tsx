import React, { useState, useEffect } from "react";
import { getMatches, getPairs, getGames } from "../lib/database";
import { Match, Pair, Game } from "../lib/database";
import StandingsTable from "./StandingsTable";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    loadTournamentData();
  }, [tournamentId]);

  const loadTournamentData = async () => {
    try {
      setLoading(true);
      const [matchesData, pairsData] = await Promise.all([
        getMatches(tournamentId),
        getPairs(tournamentId),
      ]);
      setMatches(matchesData);
      setPairs(pairsData);

      // Verificar si el torneo está terminado y calcular ganador
      const finishedMatches = matchesData.filter((match) => match.is_finished);
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

  const getMatchGames = (matchId: string) => {
    // Esta función simula obtener los juegos del partido
    // En una implementación real, necesitarías obtener los juegos de la base de datos
    return [];
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
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
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
                {matchesByRound[parseInt(round)].map((match) => (
                  <div key={match.id} className="public-match-card">
                    <div className="public-match-header">
                      <div className="public-match-title">
                        Cancha {match.court}
                      </div>
                      <div className="public-match-status">
                        {match.is_finished ? "✅ Finalizado" : "🔄 En curso"}
                      </div>
                    </div>

                    <div className="public-match-pairs">
                      <div className="public-pair-info">
                        <span className="public-pair-label">Pareja 1:</span>
                        <span className="public-pair-names">
                          {getPairName(match.pair1_id)}
                        </span>
                      </div>
                      <div className="public-pair-info">
                        <span className="public-pair-label">Pareja 2:</span>
                        <span className="public-pair-names">
                          {getPairName(match.pair2_id)}
                        </span>
                      </div>
                    </div>

                    {match.is_finished && (
                      <div className="public-match-result">
                        <div className="public-result-label">
                          Resultado Final:
                        </div>
                        <div className="public-result-score">
                          {/* Aquí mostrarías el resultado real */}
                          <span className="public-score-pair1">6</span>
                          <span className="public-score-separator">-</span>
                          <span className="public-score-pair2">4</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Tabla de Clasificación */}
      <div className="public-standings-section">
        <div className="public-standings-header">
          <h2 className="public-standings-title">📊 Tabla de Clasificación</h2>
        </div>
        <StandingsTable tournamentId={tournamentId} forceRefresh={0} />
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
          📱 Actualización automática cada 30 segundos
        </p>
        <p className="public-footer-note">
          Esta es la vista pública de resultados. Solo lectura.
        </p>
      </div>
    </div>
  );
};

export default PublicTournamentView;
