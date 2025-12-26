import React, { useState, useEffect, useCallback } from "react";
import { Match, Pair, Game } from "../lib/database";
import {
  getMatches,
  getPairs,
  getGames,
  createGame,
  deleteGame,
  updateMatch,
  updateGame,
} from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";

interface MatchCardWithResultsProps {
  match: Match;
  isSelected: boolean;
  onSelect: (matchId: string) => void;
  onCorrectScore: (match: Match) => void;
  forceRefresh?: number;
  userId?: string;
}

const MatchCardWithResults: React.FC<MatchCardWithResultsProps> = ({
  match,
  isSelected,
  onSelect,
  onCorrectScore,
  forceRefresh = 0,
  userId,
}) => {
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [pair1, setPair1] = useState<Pair | null>(null);
  const [pair2, setPair2] = useState<Pair | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pair1Score, setPair1Score] = useState("");
  const [pair2Score, setPair2Score] = useState("");

  // Función simple para cargar datos
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar partido actualizado
      const matches = await getMatches(match.tournament_id);
      const updatedMatch = matches.find((m) => m.id === match.id);
      if (!updatedMatch) throw new Error("Partido no encontrado");
      setCurrentMatch(updatedMatch);

      // Cargar parejas
      const pairs = await getPairs(match.tournament_id);
      const p1 = pairs.find((p) => p.id === updatedMatch.pair1_id);
      const p2 = pairs.find((p) => p.id === updatedMatch.pair2_id);
      setPair1(p1 || null);
      setPair2(p2 || null);

      // Cargar juegos
      const matchGames = await getGames(match.id);
      setGames(matchGames);
      
      // Permitir edición incluso si está finalizado (para reabrir o ajustar juegos)

      console.log("✅ Datos cargados");
    } catch (err) {
      console.error("❌ Error cargando datos:", err);
      setError("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [match.id, match.tournament_id]);

  // Función simple y eficiente para actualizar tabla
  const updateTable = async () => {
    if (!onCorrectScore) {
      console.error("❌ onCorrectScore no está disponible");
      return;
    }

    try {
      console.log("🔄 Actualizando tabla para partido:", match.id);

      // Obtener datos frescos del partido
      const matches = await getMatches(match.tournament_id);
      const updatedMatch = matches.find((m) => m.id === match.id);

      if (updatedMatch) {
        // Una sola llamada eficiente
        onCorrectScore(updatedMatch);
        console.log("✅ Tabla actualizada correctamente");
      } else {
        console.error("❌ No se encontró el partido actualizado");
      }
    } catch (err) {
      console.error("❌ Error actualizando tabla:", err);
    }
  };

  const refreshFromServer = async () => {
    // Recargar datos del propio card
    await loadData();
    // Actualizar tabla / padre
    await updateTable();
    // Forzar que el padre recargue el match actualizado
    if (onCorrectScore && currentMatch) {
      const matches = await getMatches(currentMatch.tournament_id);
      const updatedMatch = matches.find((m) => m.id === currentMatch.id);
      if (updatedMatch) {
        onCorrectScore(updatedMatch);
      }
    }
  };

  // Obtener nombre de pareja
  const getPairName = (pair: Pair | null): string => {
    if (!pair) return "Pareja desconocida";
    return `${pair.player1?.name || pair.player1_name || "Jugador 1"} / ${
      pair.player2?.name || pair.player2_name || "Jugador 2"
    }`;
  };

  // Calcular ganador del partido
  const getMatchWinner = () => {
    if (games.length === 0) return null;

    let pair1Wins = 0;
    let pair2Wins = 0;

    games.forEach((game) => {
      if (game.pair1_games > game.pair2_games) {
        pair1Wins++;
      } else if (game.pair2_games > game.pair1_games) {
        pair2Wins++;
      }
    });

    if (pair1Wins > pair2Wins) {
      return { winner: "pair1", pair1Wins, pair2Wins };
    } else if (pair2Wins > pair1Wins) {
      return { winner: "pair2", pair1Wins, pair2Wins };
    } else {
      return { winner: "tie", pair1Wins, pair2Wins };
    }
  };

  // Obtener etiqueta del ganador
  const getWinnerLabel = () => {
    const result = getMatchWinner();
    if (!result) return null;

    if (result.winner === "pair1") {
      return {
        text: `Ganador: ${getPairName(pair1)}`,
        type: "winner",
        icon: "🏆",
      };
    } else if (result.winner === "pair2") {
      return {
        text: `Ganador: ${getPairName(pair2)}`,
        type: "winner",
        icon: "🏆",
      };
    } else {
      return {
        text: "Empate",
        type: "tie",
        icon: "🤝",
      };
    }
  };

  // Agregar juego
  const addGame = async () => {
    if (!currentMatch) return;

    const score1 = parseInt(pair1Score);
    const score2 = parseInt(pair2Score);
    const ownerId = userId || "";

    if (isNaN(score1) || isNaN(score2)) {
      setError("Ingresa puntuaciones válidas");
      return;
    }

    if (!ownerId) {
      setError("No se pudo identificar al usuario para guardar el juego");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Crear juego
      const gameNumber = games.length + 1;
      const newGame = await createGame(currentMatch.id, gameNumber, ownerId);

      // Actualizar con puntuación
      await updateGame(newGame.id, {
        pair1_games: score1,
        pair2_games: score2,
        is_tie_break: false,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      });

      // Recargar datos y UI inmediatamente
      await refreshFromServer();

      // Log con la cantidad más reciente de juegos
      if (currentMatch) {
        const latestGames = await getGames(currentMatch.id);
        setGames(latestGames);
        console.log("✅ Juego agregado, total de juegos:", latestGames.length);
      }

      // Limpiar inputs
      setPair1Score("");
      setPair2Score("");

      console.log("✅ Juego agregado");
    } catch (err) {
      console.error("❌ Error agregando juego:", err);
      setError("Error al agregar juego");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar juego
  const removeGame = async (gameId: string) => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      await deleteGame(gameId);
      await refreshFromServer();

      if (currentMatch) {
        const latestGames = await getGames(currentMatch.id);
        setGames(latestGames);
        console.log("✅ Juego eliminado, juegos restantes:", latestGames.length);
      }
    } catch (err) {
      console.error("❌ Error eliminando juego:", err);
      setError("Error al eliminar juego");
    } finally {
      setLoading(false);
    }
  };

  // Finalizar partido
  const finishMatch = async () => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      // Obtener parejas para estadísticas
      const allPairs = await getPairs(currentMatch.tournament_id);

      // Acumular estadísticas
      const result = await MatchResultCalculator.accumulateMatchStatistics(
        currentMatch,
        games,
        allPairs
      );

      if (result.success) {
        // Calcular marcador final del partido para guardarlo en el match
        const matchGames = await getGames(currentMatch.id);
        let pair1FinalScore = 0;
        let pair2FinalScore = 0;

        // Calcular sets ganados por cada pareja
        matchGames.forEach((game) => {
          if (game.pair1_games >= 6) {
            pair1FinalScore++;
          }
          if (game.pair2_games >= 6) {
            pair2FinalScore++;
          }
        });

        // Marcar como finalizado y guardar marcador final
        await updateMatch(currentMatch.id, {
          status: "finished",
          pair1_score: pair1FinalScore,
          pair2_score: pair2FinalScore,
        });

        console.log(
          `🏆 Partido finalizado: ${pair1FinalScore} - ${pair2FinalScore}`
        );

        // Actualizar el estado de juegos con los que ya tenemos
        setGames(matchGames);

        // Recargar datos y actualizar tabla automáticamente
        await refreshFromServer();
        
        // Cerrar el editor después de finalizar
        setIsEditing(false);
        
        // Forzar actualización del componente padre para que recargue los matches
        // Esto asegura que el prop match se actualice con el nuevo status
        if (onCorrectScore) {
          const matches = await getMatches(currentMatch.tournament_id);
          const updatedMatch = matches.find((m) => m.id === currentMatch.id);
          if (updatedMatch) {
            onCorrectScore(updatedMatch);
          }
        }

        console.log("✅ Partido finalizado, juegos:", matchGames.length);
      } else {
        setError("Error: " + result.message);
      }
    } catch (err) {
      console.error("❌ Error finalizando partido:", err);
      setError("Error al finalizar partido");
    } finally {
      setLoading(false);
    }
  };

  // Reabrir partido
  const reopenMatch = async () => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      // Marcar como no finalizado
      await updateMatch(currentMatch.id, { status: "pending" });

      // Recargar datos y actualizar tabla automáticamente
      await loadData();
      await updateTable();

      console.log("✅ Partido reabierto");
    } catch (err) {
      console.error("❌ Error reabriendo partido:", err);
      setError("Error al reabrir partido");
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar o cuando cambian las dependencias críticas
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Cargar partido actualizado
        const matches = await getMatches(match.tournament_id);
        const updatedMatch = matches.find((m) => m.id === match.id);
        if (!updatedMatch) throw new Error("Partido no encontrado");
        
        if (!isMounted) return;
        setCurrentMatch(updatedMatch);

        // Cargar parejas
        const pairs = await getPairs(match.tournament_id);
        const p1 = pairs.find((p) => p.id === updatedMatch.pair1_id);
        const p2 = pairs.find((p) => p.id === updatedMatch.pair2_id);
        setPair1(p1 || null);
        setPair2(p2 || null);

        // Cargar juegos
        const matchGames = await getGames(match.id);
        if (!isMounted) return;
        setGames(matchGames);
        
        // Mantener el editor abierto aunque esté finalizado (se puede reabrir)

        console.log("✅ Datos cargados");
      } catch (err) {
        if (!isMounted) return;
        console.error("❌ Error cargando datos:", err);
        setError("Error cargando datos");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [match.id, match.tournament_id, match.status, forceRefresh, isEditing]);

  // Actualizar currentMatch cuando el prop match cambia (solo si realmente cambió)
  useEffect(() => {
    if (match && (!currentMatch || 
        match.id !== currentMatch.id || 
        match.status !== currentMatch.status ||
        match.pair1_score !== currentMatch.pair1_score ||
        match.pair2_score !== currentMatch.pair2_score)) {
      setCurrentMatch(match);
      // Si el status cambió a finished, cerrar el editor
      if (match.status === 'finished' && isEditing) {
        setIsEditing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, match.status, match.pair1_score, match.pair2_score, isEditing]);

  if (loading) {
    return (
      <div className="modern-match-card">
        <div className="modern-loading">
          <div className="modern-loading-spinner"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  if (!currentMatch) {
    return null;
  }

  return (
    <div
      className={`modern-match-card ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(currentMatch.id)}
    >
      {/* Header */}
      <div className="modern-match-header">
        <h5 className="modern-match-title">
          {getPairName(pair1)} vs {getPairName(pair2)}
        </h5>
        <div
          className={`modern-match-status ${
            currentMatch.status === "finished" ? "finished" : "progress"
          }`}
        >
          {currentMatch.status === "finished" ? "FINALIZADO" : "En progreso"}
        </div>
      </div>

      {/* Información */}
      <div className="modern-match-badges">
        <span className="modern-match-badge">
          <span className="modern-badge-icon">🏟️</span>
          Cancha {currentMatch.court}
        </span>
        <span className="modern-match-badge">
          <span className="modern-badge-icon">🔄</span>
          Ronda {currentMatch.round || 1}
        </span>
      </div>

      {/* Parejas */}
      <div className="modern-match-pairs">
        <div className="modern-pair-info">
          <span className="modern-pair-label">Pareja 1:</span>
          <span className="modern-pair-names">{getPairName(pair1)}</span>
        </div>
        <div className="modern-pair-info">
          <span className="modern-pair-label">Pareja 2:</span>
          <span className="modern-pair-names">{getPairName(pair2)}</span>
        </div>
      </div>

      {/* Etiqueta del Ganador */}
      {games.length > 0 && getWinnerLabel() && (
        <div className="modern-winner-label">
          <div
            className={`modern-winner-badge modern-winner-${
              getWinnerLabel()?.type
            }`}
          >
            <span className="modern-winner-icon">{getWinnerLabel()?.icon}</span>
            <span className="modern-winner-text">{getWinnerLabel()?.text}</span>
          </div>
        </div>
      )}

      {/* Resultados */}
      {games.length > 0 && (
        <div className="modern-games-results">
          <h6 className="modern-games-title">📊 Juegos:</h6>
          <div className="modern-games-grid">
            {games.map((game, index) => (
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

      {/* Editor */}
      {isEditing && (
        <div className="modern-match-editor">
          <div className="modern-editor-content">
            {/* Registrar Resultado */}
            <div className="modern-add-game-section">
              <h6 className="modern-add-game-title">📝 Registrar Resultado</h6>
              <div className="modern-score-inputs">
                <div className="modern-score-input-group">
                  <label className="modern-score-label">
                    {getPairName(pair1)}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={pair1Score}
                    onChange={(e) => setPair1Score(e.target.value)}
                    className="modern-score-input"
                    onClick={(e) => e.stopPropagation()}
                    placeholder="0"
                  />
                </div>
                <span className="modern-score-separator">vs</span>
                <div className="modern-score-input-group">
                  <label className="modern-score-label">
                    {getPairName(pair2)}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={pair2Score}
                    onChange={(e) => setPair2Score(e.target.value)}
                    className="modern-score-input"
                    onClick={(e) => e.stopPropagation()}
                    placeholder="0"
                  />
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  addGame();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  addGame();
                }}
                className="modern-add-game-btn"
                disabled={loading}
              >
                ➕ Agregar Juego
              </button>
            </div>

            {/* Eliminar juegos */}
            {games.length > 0 && (
              <div className="modern-games-list">
                <h6 className="modern-games-list-title">🗑️ Eliminar Juegos</h6>
                {games.map((game, index) => (
                  <div key={game.id} className="modern-game-item">
                    <span className="modern-game-info">
                      J{index + 1}: {game.pair1_games}-{game.pair2_games}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeGame(game.id);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeGame(game.id);
                      }}
                      className="modern-delete-game-btn"
                      disabled={loading}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Botones de acción */}
            {currentMatch.status !== "finished" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  finishMatch();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  finishMatch();
                }}
                className="modern-finish-match-btn"
                disabled={loading}
              >
                🏆 Finalizar Partido
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  reopenMatch();
                }}
                className="modern-reopen-match-btn"
                disabled={loading}
              >
                🔄 Reabrir Partido
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="modern-error">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Acciones */}
      <div className="modern-match-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            loadData();
          }}
          className="modern-match-btn modern-refresh-btn"
          title="Actualizar datos"
        >
          🔄 Actualizar
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(!isEditing);
          }}
          className="modern-match-btn modern-edit-btn"
          title="Editar marcador"
        >
          {isEditing ? "❌ Cerrar" : "✏️ Editar"}
        </button>
      </div>
    </div>
  );
};

export default MatchCardWithResults;
