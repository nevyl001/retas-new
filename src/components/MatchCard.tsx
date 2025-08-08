import React, { useState, useEffect, useCallback } from "react";
import { Match, Pair, Game } from "../lib/database";
import { getMatches, getPairs, getGames } from "../lib/database";

interface MatchCardProps {
  match: Match;
  isSelected: boolean;
  onSelect: (matchId: string) => void;
  onViewResults: (match: Match) => void;
  onCorrectScore: (match: Match) => void;
  forceRefresh?: number;
}

interface MatchWithPairs extends Match {
  pair1?: Pair;
  pair2?: Pair;
}

const MatchCard: React.FC<MatchCardProps> = ({
  match,
  isSelected,
  onSelect,
  onViewResults,
  onCorrectScore,
  forceRefresh = 0,
}) => {
  const [currentMatch, setCurrentMatch] = useState<MatchWithPairs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Función para cargar datos frescos del partido
  const loadFreshMatchData = useCallback(
    async (matchId: string) => {
      console.log("=== CARGANDO DATOS FRESCOS PARA TARJETA ===", matchId);
      setLoading(true);
      setError(null);

      try {
        // Cargar partido actualizado
        const matches = await getMatches(match.tournament_id);
        const updatedMatch = matches.find((m) => m.id === matchId);

        if (!updatedMatch) {
          throw new Error("Partido no encontrado para tarjeta");
        }

        // Cargar parejas actualizadas
        const pairs = await getPairs(match.tournament_id);
        const pair1 = pairs.find((p) => p.id === updatedMatch.pair1_id);
        const pair2 = pairs.find((p) => p.id === updatedMatch.pair2_id);

        // Crear match con parejas completas
        const matchWithPairs: MatchWithPairs = {
          ...updatedMatch,
          pair1,
          pair2,
        };

        console.log("✅ Tarjeta actualizada:", matchWithPairs);
        setCurrentMatch(matchWithPairs);
      } catch (err) {
        console.error("❌ Error cargando datos para tarjeta:", err);
        setError("Error cargando datos del partido");
      } finally {
        setLoading(false);
      }
    },
    [match.tournament_id]
  );

  // Función para obtener el nombre del ganador
  const getWinnerName = (match: MatchWithPairs): string => {
    if (!match.winner_id) return "Empate";

    if (match.winner_id === match.pair1_id && match.pair1) {
      return `${match.pair1.player1?.name} y ${match.pair1.player2?.name}`;
    } else if (match.winner_id === match.pair2_id && match.pair2) {
      return `${match.pair2.player1?.name} y ${match.pair2.player2?.name}`;
    }

    return "Ganador desconocido";
  };

  // Función para obtener el texto de resultado
  const getResultDisplayText = (match: MatchWithPairs): string => {
    if (!match.winner_id) {
      return "Empate";
    }

    const winnerName = getWinnerName(match);
    return `Ganador: ${winnerName}`;
  };

  // Función para obtener el nombre de la pareja
  const getPairName = (pair: Pair | undefined): string => {
    if (!pair) return "Pareja desconocida";
    return `${pair.player1?.name} y ${pair.player2?.name}`;
  };

  // Cargar datos cuando se monta el componente o se fuerza actualización
  useEffect(() => {
    console.log(
      "🔄 Cargando datos para tarjeta:",
      match.id,
      "forceRefresh:",
      forceRefresh
    );
    loadFreshMatchData(match.id);
  }, [match.id, forceRefresh, loadFreshMatchData]);

  // Función para manejar clic en la tarjeta
  const handleCardClick = () => {
    if (currentMatch) {
      onSelect(currentMatch.id);
    }
  };

  // Función para manejar clic en botón de resultados
  const handleViewResults = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMatch) {
      onViewResults(currentMatch);
    }
  };

  // Función para manejar clic en botón de corrección
  const handleCorrectScore = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMatch) {
      onCorrectScore(currentMatch);
    }
  };

  if (loading) {
    return (
      <div className="match-card loading">
        <div className="loading-spinner"></div>
        <p>Cargando partido...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="match-card error">
        <p>❌ {error}</p>
        <button
          onClick={() => loadFreshMatchData(match.id)}
          className="retry-button"
        >
          🔄 Reintentar
        </button>
      </div>
    );
  }

  if (!currentMatch) {
    return (
      <div className="match-card error">
        <p>No se pudo cargar el partido</p>
      </div>
    );
  }

  return (
    <div
      className={`match-card ${isSelected ? "selected" : ""}`}
      onClick={handleCardClick}
    >
      <div className="match-header">
        <h5>
          {getPairName(currentMatch.pair1)} vs {getPairName(currentMatch.pair2)}
        </h5>
      </div>

      <div className="match-info">
        <span className="court-badge">
          <span>🏟️</span>
          Cancha {currentMatch.court}
        </span>
        <span className="round-badge">
          <span>🔄</span>
          Ronda {currentMatch.round}
        </span>
      </div>

      <div className="match-pairs">
        <p>
          <strong>Pareja 1:</strong> {getPairName(currentMatch.pair1)}
        </p>
        <p>
          <strong>Pareja 2:</strong> {getPairName(currentMatch.pair2)}
        </p>
      </div>

      {currentMatch.is_finished && (
        <div className="winner">
          <span className="winner-icon">🏆</span>
          <span className="winner-text">
            {getResultDisplayText(currentMatch)}
          </span>
        </div>
      )}

      <div className="match-status">
        {currentMatch.is_finished ? (
          <span className="status-finished">✅ Finalizado</span>
        ) : (
          <span className="status-pending">⏳ En progreso</span>
        )}
      </div>

      <div className="match-actions">
        <button
          onClick={handleViewResults}
          className="view-results-btn"
          title="Ver resultados detallados"
        >
          📊 Ver Resultados
        </button>
        <button
          onClick={handleCorrectScore}
          className="correct-result-btn"
          title="Corregir resultado del partido"
        >
          🔧 Marcador
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            loadFreshMatchData(match.id);
          }}
          className="refresh-btn"
          title="Actualizar datos del partido"
        >
          🔄 Actualizar
        </button>
      </div>
    </div>
  );
};

export default MatchCard;
