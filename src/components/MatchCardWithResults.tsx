import React, { useState, useEffect, useCallback, useRef } from "react";
import { Match, Pair, Game } from "../lib/database";
import {
  getGames, // Solo necesitamos getGames (match y pairs vienen como props)
  createGame,
  deleteGame,
  updateMatch,
  updateGame,
} from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";

interface MatchCardWithResultsProps {
  match: Match;
  pairs: Pair[]; // Agregado: recibir pairs como prop para evitar cargas redundantes
  /** Canchas configuradas en la reta (calendario / descansos); la edición manual del partido permite más pistas. */
  maxCourts?: number;
  isSelected: boolean;
  onSelect: (matchId: string) => void;
  onCorrectScore: (match: Match) => void;
  forceRefresh?: number;
  userId?: string;
}

const MatchCardWithResults: React.FC<MatchCardWithResultsProps> = ({
  match,
  pairs,
  maxCourts = 12,
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
  const [courtInput, setCourtInput] = useState("");
  const [roundInput, setRoundInput] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const isUpdatingRef = useRef(false); // Prevenir múltiples actualizaciones simultáneas

  /** Tope al editar cancha en el partido: no limitar solo a `tournament.courts` (a menudo 1) o el guardado siempre queda en 1. */
  const courtEditCap = Math.max(1, maxCourts, 32);

  // Función optimizada para recargar datos locales SIN múltiples actualizaciones
  const refreshFromServer = useCallback(async () => {
    // Prevenir múltiples actualizaciones simultáneas
    if (isUpdatingRef.current) {
      console.log("⏳ Actualización ya en progreso, ignorando...");
      return;
    }

    try {
      isUpdatingRef.current = true;

      // Actualizar desde props (vienen actualizados del padre)
      setCurrentMatch(match);
      const p1 = pairs.find((p) => p.id === match.pair1_id);
      const p2 = pairs.find((p) => p.id === match.pair2_id);
      setPair1(p1 || null);
      setPair2(p2 || null);

      // Solo recargar juegos (único dato que necesita actualizarse)
      const matchGames = await getGames(match.id);
      setGames(matchGames);

      // Solo actualizar tabla UNA VEZ al final usando match del prop (ya viene actualizado del padre)
      if (onCorrectScore) {
        onCorrectScore(match);
      }
    } catch (err) {
      console.error("❌ Error recargando datos:", err);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [match, pairs, onCorrectScore]);

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

  const saveCourtAndRound = async () => {
    if (!currentMatch) return;

    try {
      setMetaSaving(true);
      setError(null);
      const parsedCourt = parseInt(courtInput, 10);
      const parsedRound = parseInt(roundInput, 10);
      if (Number.isNaN(parsedCourt) || Number.isNaN(parsedRound)) {
        setError("Cancha y ronda deben ser números válidos");
        setMetaSaving(false);
        return;
      }
      const court = Math.min(courtEditCap, Math.max(1, parsedCourt));
      const round = Math.min(999, Math.max(1, parsedRound));
      const updated = await updateMatch(currentMatch.id, { court, round });
      setCurrentMatch(updated);
      setCourtInput(String(court));
      setRoundInput(String(round));
      if (onCorrectScore) {
        onCorrectScore(updated);
      }
      setIsEditingMeta(false);
    } catch (err) {
      console.error("❌ Error guardando cancha/ronda:", err);
      setError("No se pudo guardar cancha ni ronda");
    } finally {
      setMetaSaving(false);
    }
  };

  const openMetaEditor = useCallback(() => {
    setCourtInput(
      String(Math.min(courtEditCap, Math.max(1, match.court ?? 1)))
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
    setError(null);
    setIsEditingMeta(true);
  }, [match.court, match.round, courtEditCap]);

  const cancelMetaEdit = useCallback(() => {
    setCourtInput(
      String(Math.min(courtEditCap, Math.max(1, match.court ?? 1)))
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
    setIsEditingMeta(false);
    setError(null);
  }, [match.court, match.round, courtEditCap]);

  // Agregar juego - OPTIMIZADO: una sola actualización al final
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

      // Limpiar inputs inmediatamente
      setPair1Score("");
      setPair2Score("");

      // UNA SOLA actualización al final (esto actualiza todo)
      await refreshFromServer();

      console.log("✅ Juego agregado y UI actualizada");
    } catch (err) {
      console.error("❌ Error agregando juego:", err);
      setError("Error al agregar juego");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar juego - OPTIMIZADO: una sola actualización al final
  const removeGame = async (gameId: string) => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      await deleteGame(gameId);

      // UNA SOLA actualización al final (esto actualiza todo)
      await refreshFromServer();

      console.log("✅ Juego eliminado");
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

      // Usar pairs recibidos como prop (ya están disponibles, no recargar)
      // Acumular estadísticas
      const result = await MatchResultCalculator.accumulateMatchStatistics(
        currentMatch,
        games,
        pairs // Usar prop en lugar de recargar
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

        // Cerrar el editor después de finalizar
        setIsEditing(false);

        // UNA SOLA actualización al final (esto actualiza todo, incluyendo status)
        await refreshFromServer();

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

  // Reabrir partido - OPTIMIZADO: una sola actualización
  const reopenMatch = async () => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      // Marcar como no finalizado
      await updateMatch(currentMatch.id, { status: "pending" });

      // UNA SOLA actualización al final
      await refreshFromServer();

      console.log("✅ Partido reabierto");
    } catch (err) {
      console.error("❌ Error reabriendo partido:", err);
      setError("Error al reabrir partido");
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar - OPTIMIZADO: solo cargar juegos, usar props para match y pairs
  useEffect(() => {
    // Inicializar estado desde props inmediatamente (sin llamadas a BD)
    setCurrentMatch(match);
    const p1 = pairs.find((p) => p.id === match.pair1_id);
    const p2 = pairs.find((p) => p.id === match.pair2_id);
    setPair1(p1 || null);
    setPair2(p2 || null);

    // Solo cargar juegos (único dato específico del card que necesita BD)
    let isMounted = true;
    const fetchGames = async () => {
      try {
        setLoading(true);
        const matchGames = await getGames(match.id);
        if (!isMounted) return;
        setGames(matchGames);
        console.log("✅ Juegos cargados para partido:", match.id);
      } catch (err) {
        if (!isMounted) return;
        console.error("❌ Error cargando juegos:", err);
        setError("Error cargando juegos");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchGames();

    return () => {
      isMounted = false;
    };
  }, [match.id, match, pairs]); // Recargar cuando cambia el match o pairs

  // Actualizar estado cuando el prop match cambia (sin recargar de BD)
  useEffect(() => {
    // Actualizar match desde prop (viene actualizado del padre)
    if (match && (!currentMatch || 
        match.id !== currentMatch.id || 
        match.status !== currentMatch.status ||
        match.pair1_score !== currentMatch.pair1_score ||
        match.pair2_score !== currentMatch.pair2_score ||
        match.court !== currentMatch.court ||
        (match.round ?? 1) !== (currentMatch.round ?? 1))) {
      setCurrentMatch(match);
      
      // Si el status cambió a finished, cerrar el editor
      if (match.status === 'finished' && isEditing) {
        setIsEditing(false);
      }
      
      // Actualizar pairs desde prop (vienen actualizados del padre)
      if (match.pair1_id && match.pair2_id) {
        const p1 = pairs.find((p) => p.id === match.pair1_id);
        const p2 = pairs.find((p) => p.id === match.pair2_id);
        setPair1(p1 || null);
        setPair2(p2 || null);
      }
      
      // Solo recargar juegos si cambió el status o scores (puede haber nuevos juegos)
      if (match.id === currentMatch?.id && 
          (match.status !== currentMatch.status || 
           match.pair1_score !== currentMatch.pair1_score ||
           match.pair2_score !== currentMatch.pair2_score)) {
        getGames(match.id).then((matchGames) => {
          setGames(matchGames);
        }).catch((err) => {
          console.error("❌ Error recargando juegos:", err);
        });
      }
    }
  }, [match, pairs, currentMatch, isEditing]); // Incluir todas las dependencias

  useEffect(() => {
    if (isEditingMeta) return;
    setCourtInput(
      String(Math.min(courtEditCap, Math.max(1, match.court ?? 1)))
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
  }, [match.id, match.court, match.round, courtEditCap, isEditingMeta]);

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

      <div
        className="modern-match-badges-row"
        onClick={(e) => e.stopPropagation()}
      >
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
        {!isEditingMeta ? (
          <button
            type="button"
            className="modern-meta-pencil-btn"
            onClick={(e) => {
              e.stopPropagation();
              openMetaEditor();
            }}
            title="Editar cancha y ronda"
            aria-label="Editar cancha y ronda"
            disabled={loading || metaSaving}
          >
            ✏️
          </button>
        ) : (
          <button
            type="button"
            className="modern-meta-pencil-btn modern-meta-pencil-btn--close"
            onClick={(e) => {
              e.stopPropagation();
              cancelMetaEdit();
            }}
            title="Cerrar sin guardar"
            aria-label="Cerrar edición de cancha y ronda"
            disabled={metaSaving}
          >
            ✕
          </button>
        )}
      </div>

      {isEditingMeta && (
        <div
          className="modern-match-meta-inline"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="modern-meta-inline-fields">
            <label className="modern-meta-inline-label">
              <span>Cancha</span>
              <input
                type="number"
                min={1}
                max={courtEditCap}
                value={courtInput}
                onChange={(e) => setCourtInput(e.target.value)}
                className="modern-meta-inline-input"
                aria-label="Número de cancha"
              />
            </label>
            <label className="modern-meta-inline-label">
              <span>Ronda</span>
              <input
                type="number"
                min={1}
                max={999}
                value={roundInput}
                onChange={(e) => setRoundInput(e.target.value)}
                className="modern-meta-inline-input"
                aria-label="Número de ronda"
              />
            </label>
          </div>
          <div className="modern-meta-inline-actions">
            <button
              type="button"
              className="modern-meta-inline-save"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                saveCourtAndRound();
              }}
              disabled={metaSaving || loading}
            >
              {metaSaving ? "⏳…" : "💾 Guardar"}
            </button>
            <button
              type="button"
              className="modern-meta-inline-cancel"
              onClick={(e) => {
                e.stopPropagation();
                cancelMetaEdit();
              }}
              disabled={metaSaving}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
            e.preventDefault();
            refreshFromServer();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchEnd={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await refreshFromServer();
          }}
          className="modern-match-btn modern-refresh-btn"
          title="Actualizar datos"
          disabled={loading}
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

// Usar React.memo para evitar re-renders innecesarios cuando props no cambian
export default React.memo(MatchCardWithResults, (prevProps, nextProps) => {
  // Solo re-renderizar si cambian datos críticos
  return (
    prevProps.match.id === nextProps.match.id &&
    prevProps.match.status === nextProps.match.status &&
    prevProps.match.pair1_score === nextProps.match.pair1_score &&
    prevProps.match.pair2_score === nextProps.match.pair2_score &&
    prevProps.match.court === nextProps.match.court &&
    (prevProps.match.round ?? 1) === (nextProps.match.round ?? 1) &&
    prevProps.maxCourts === nextProps.maxCourts &&
    prevProps.forceRefresh === nextProps.forceRefresh &&
    prevProps.pairs.length === nextProps.pairs.length &&
    prevProps.pairs.every((p, i) => p.id === nextProps.pairs[i]?.id)
  );
});
