import React, { useState, useEffect, useCallback } from "react";
import { Match, Pair, Game } from "../lib/database";
import { getMatches, getPairs, getGames } from "../lib/database";

interface MatchCardWithResultsProps {
  match: Match;
  isSelected: boolean;
  onSelect: (matchId: string) => void;
  onCorrectScore: (match: Match) => void;
  forceRefresh?: number;
}

interface MatchWithPairs extends Match {
  pair1?: Pair;
  pair2?: Pair;
}

const MatchCardWithResults: React.FC<MatchCardWithResultsProps> = ({
  match,
  isSelected,
  onSelect,
  onCorrectScore,
  forceRefresh = 0,
}) => {
  const [currentMatch, setCurrentMatch] = useState<MatchWithPairs | null>(null);
  const [matchGames, setMatchGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Función para cargar datos frescos del partido
  const loadFreshMatchData = useCallback(
    async (matchId: string) => {
      console.log(
        "=== CARGANDO DATOS FRESCOS PARA TARJETA CON RESULTADOS ===",
        matchId
      );
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

        // Cargar juegos del partido
        const games = await getGames(matchId);

        // Crear match con parejas completas
        const matchWithPairs: MatchWithPairs = {
          ...updatedMatch,
          pair1,
          pair2,
        };

        console.log("✅ Tarjeta con resultados actualizada:", matchWithPairs);
        console.log("✅ Juegos cargados:", games);
        setCurrentMatch(matchWithPairs);
        setMatchGames(games);
      } catch (err) {
        console.error(
          "❌ Error cargando datos para tarjeta con resultados:",
          err
        );
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
      return `${match.pair1.player1?.name} / ${match.pair1.player2?.name}`;
    } else if (match.winner_id === match.pair2_id && match.pair2) {
      return `${match.pair2.player1?.name} / ${match.pair2.player2?.name}`;
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

  // Función para calcular el ganador basado en los juegos
  const calculateWinnerFromGames = () => {
    if (matchGames.length === 0) return null;

    let pair1Sets = 0;
    let pair2Sets = 0;

    matchGames.forEach((game) => {
      if (game.is_tie_break) {
        // Para tie-break, el ganador es quien llega a 10 puntos con diferencia de 2
        if (
          game.tie_break_pair1_points >= 10 &&
          game.tie_break_pair1_points - game.tie_break_pair2_points >= 2
        ) {
          pair1Sets++;
        } else if (
          game.tie_break_pair2_points >= 10 &&
          game.tie_break_pair2_points - game.tie_break_pair1_points >= 2
        ) {
          pair2Sets++;
        }
      } else {
        // Para juegos normales, el ganador es quien tiene más games
        if (game.pair1_games > game.pair2_games) {
          pair1Sets++;
        } else if (game.pair2_games > game.pair1_games) {
          pair2Sets++;
        }
      }
    });

    if (pair1Sets === pair2Sets) {
      return "Empate";
    } else if (pair1Sets > pair2Sets) {
      return `Ganador: ${getPairName(currentMatch?.pair1)}`;
    } else {
      return `Ganador: ${getPairName(currentMatch?.pair2)}`;
    }
  };

  // Función para obtener el nombre de la pareja
  const getPairName = (pair: Pair | undefined): string => {
    if (!pair) return "Pareja desconocida";
    return `${pair.player1?.name} / ${pair.player2?.name}`;
  };

  // Función para formatear el resultado de un juego
  const formatGameScore = (game: Game): string => {
    if (game.is_tie_break) {
      return `${game.tie_break_pair1_points}-${game.tie_break_pair2_points}`;
    } else {
      return `${game.pair1_games}-${game.pair2_games}`;
    }
  };

  // Cargar datos cuando se monta el componente o se fuerza actualización
  useEffect(() => {
    console.log(
      "🔄 Cargando datos para tarjeta con resultados:",
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

  // Función para manejar clic en botón de corrección
  const handleCorrectScore = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("🔧 Botón Marcador clickeado para partido:", currentMatch?.id);
    if (currentMatch && onCorrectScore) {
      console.log("🔧 Llamando a onCorrectScore con:", currentMatch);
      onCorrectScore(currentMatch);
    } else {
      console.log("❌ Error: currentMatch o onCorrectScore no disponible");
    }
  };

  if (loading) {
    return (
      <div className="match-card-new loading">
        <div className="loading-spinner-new"></div>
        <p>Cargando partido...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="match-card-new error">
        <p>❌ {error}</p>
        <button
          onClick={() => loadFreshMatchData(match.id)}
          className="retry-button-new"
        >
          🔄 Reintentar
        </button>
      </div>
    );
  }

  if (!currentMatch) {
    return (
      <div className="match-card-new error">
        <p>No se pudo cargar el partido</p>
      </div>
    );
  }

  const matchWinner = calculateWinnerFromGames();

  return (
    <div
      className={`match-card-new ${isSelected ? "selected" : ""}`}
      onClick={handleCardClick}
    >
      {/* Header con información principal */}
      <div className="match-header-new">
        <div className="match-title-section">
          <h5 className="match-title">
            {getPairName(currentMatch.pair1)} vs{" "}
            {getPairName(currentMatch.pair2)}
          </h5>
        </div>

        {/* Badges de información */}
        <div className="match-badges">
          <span className="court-badge-new">
            <span className="badge-icon">🏟️</span>
            Cancha {currentMatch.court}
          </span>
          <span className="round-badge-new">
            <span className="badge-icon">🔄</span>
            Ronda {currentMatch.round}
          </span>
        </div>
      </div>

      {/* Estado del partido */}
      <div className="match-status-new">
        {currentMatch.is_finished ? (
          <span className="status-finished-new">✅ Finalizado</span>
        ) : (
          <span className="status-pending-new">⏳ En progreso</span>
        )}
      </div>

      {/* Información de las parejas */}
      <div className="match-pairs-new">
        <div className="pair-info">
          <span className="pair-label">Pareja 1:</span>
          <span className="pair-names">{getPairName(currentMatch.pair1)}</span>
        </div>
        <div className="pair-info">
          <span className="pair-label">Pareja 2:</span>
          <span className="pair-names">{getPairName(currentMatch.pair2)}</span>
        </div>
      </div>

      {/* Resultados de juegos */}
      {matchGames.length > 0 && (
        <div className="match-games-results-new">
          <h6 className="games-title">📊 Resultados por Juego:</h6>
          <div className="games-grid-new">
            {matchGames.map((game, index) => (
              <div key={game.id} className="game-result-new">
                <span className="game-number-new">Juego {index + 1}:</span>
                <span className="game-score-new">
                  {formatGameScore(game)}
                  {game.is_tie_break && (
                    <span className="tie-break-indicator-new">TB</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ganador */}
      {currentMatch.is_finished && (
        <div className="winner-new">
          <span className="winner-icon-new">🏆</span>
          <span className="winner-text-new">
            {matchWinner || getResultDisplayText(currentMatch)}
          </span>
        </div>
      )}

      {/* Acciones */}
      <div className="partido-acciones">
        <button
          onClick={handleCorrectScore}
          className="btn-marcador-partido"
          title="Corregir resultado del partido"
          type="button"
        >
          🔧 Marcador
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            loadFreshMatchData(match.id);
          }}
          className="btn-actualizar-partido"
          title="Actualizar datos del partido"
          type="button"
        >
          🔄 Actualizar
        </button>
      </div>
    </div>
  );
};

export default MatchCardWithResults;
