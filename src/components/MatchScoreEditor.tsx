import React, { useState, useEffect } from "react";
import { Match, Game, Pair } from "../lib/database";
import {
  getGames,
  createGame,
  updateGame,
  deleteGame,
  getPairs,
  updateMatch,
} from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";

interface MatchScoreEditorProps {
  match: Match;
  onClose: () => void;
  onMatchFinish: () => void;
}

export const MatchScoreEditor: React.FC<MatchScoreEditorProps> = ({
  match,
  onClose,
  onMatchFinish,
}) => {
  const [games, setGames] = useState<Game[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Cargar datos al montar
  useEffect(() => {
    loadData();
  }, [match.id]);

  const loadData = async () => {
    try {
      console.log("🔄 Cargando datos del editor...");
      const [matchGames, allPairs] = await Promise.all([
        getGames(match.id),
        getPairs(match.tournament_id),
      ]);
      setGames(matchGames);
      setPairs(allPairs);
      console.log(
        `✅ Datos cargados: ${matchGames.length} juegos, ${allPairs.length} parejas`
      );
    } catch (err) {
      console.error("❌ Error cargando datos:", err);
      setError("Error al cargar datos");
    }
  };

  // Agregar juego
  const addGame = async () => {
    try {
      setLoading(true);
      const newGame = await createGame(match.id, games.length + 1);
      setGames([...games, newGame]);
      console.log("✅ Juego agregado");
    } catch (err) {
      console.error("❌ Error agregando juego:", err);
      setError("Error al agregar juego");
    } finally {
      setLoading(false);
    }
  };

  // Actualizar puntuación - SOLO ACTUALIZA LA BASE DE DATOS
  const updateScore = async (
    gameId: string,
    pair1Score: number,
    pair2Score: number
  ) => {
    try {
      console.log(`🔄 Actualizando puntuación: ${pair1Score}-${pair2Score}`);

      await updateGame(gameId, {
        pair1_games: pair1Score,
        pair2_games: pair2Score,
      });

      setGames(
        games.map((game) =>
          game.id === gameId
            ? { ...game, pair1_games: pair1Score, pair2_games: pair2Score }
            : game
        )
      );

      console.log("✅ Puntuación actualizada en BD");
    } catch (err) {
      console.error("❌ Error actualizando puntuación:", err);
      setError("Error al actualizar puntuación");
    }
  };

  // Eliminar juego
  const removeGame = async (gameId: string) => {
    try {
      setLoading(true);
      await deleteGame(gameId);
      setGames(games.filter((game) => game.id !== gameId));
      console.log("✅ Juego eliminado");
    } catch (err) {
      console.error("❌ Error eliminando juego:", err);
      setError("Error al eliminar juego");
    } finally {
      setLoading(false);
    }
  };

  // FINALIZAR PARTIDO - SOLO CUANDO SE PRESIONA EL BOTÓN
  const finishMatch = async () => {
    if (games.length === 0) {
      setError("No hay juegos para finalizar");
      return;
    }

    try {
      setLoading(true);
      setError("");
      console.log("🏆 FINALIZANDO PARTIDO...");

      // 1. Calcular ganador
      let pair1Total = 0;
      let pair2Total = 0;

      games.forEach((game) => {
        pair1Total += game.pair1_games;
        pair2Total += game.pair2_games;
      });

      const winnerId =
        pair1Total > pair2Total
          ? match.pair1_id
          : pair2Total > pair1Total
          ? match.pair2_id
          : undefined;

      console.log(
        `📊 Resultado: ${pair1Total}-${pair2Total}, Ganador: ${winnerId}`
      );

      // 2. Marcar partido como finalizado
      await updateMatch(match.id, {
        winner_id: winnerId,
        is_finished: true,
      });
      console.log("✅ Partido marcado como finalizado");

      // 3. Actualizar estadísticas de parejas usando el calculador optimizado
      console.log("🔄 Actualizando estadísticas de parejas...");
      const result = await MatchResultCalculator.recalculateAllStatistics(
        match.tournament_id
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      console.log("✅ Estadísticas actualizadas");

      // 4. Llamar callback para actualizar tabla
      console.log("🔄 Llamando onMatchFinish para actualizar tabla");
      onMatchFinish();

      // 5. Cerrar modal
      console.log("✅ Cerrando modal");
      onClose();
    } catch (err) {
      console.error("❌ Error finalizando partido:", err);
      setError("Error al finalizar partido: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Obtener nombre de pareja
  const getPairName = (pairId: string) => {
    const pair = pairs.find((p) => p.id === pairId);
    return pair
      ? `${pair.player1?.name || "J1"} / ${pair.player2?.name || "J2"}`
      : "Pareja";
  };

  return (
    <div className="modern-score-editor-overlay">
      <div className="modern-score-editor-modal">
        {/* Header */}
        <div className="modern-score-editor-header">
          <div className="modern-score-editor-title">
            <span className="modern-score-editor-icon">🎾</span>
            <h3>Editor de Marcador</h3>
          </div>
          <button className="modern-score-editor-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="modern-score-editor-content">
          {/* Información del partido */}
          <div className="modern-score-editor-match-info">
            <div className="modern-score-editor-match-title">
              <span>🏆</span>
              Partido {match.court} - Ronda {match.round}
            </div>
            <div className="modern-score-editor-pairs">
              <div className="modern-score-editor-pair">
                <div className="modern-score-editor-pair-label">Pareja 1</div>
                <div className="modern-score-editor-pair-names">
                  {getPairName(match.pair1_id)}
                </div>
              </div>
              <div className="modern-score-editor-pair">
                <div className="modern-score-editor-pair-label">Pareja 2</div>
                <div className="modern-score-editor-pair-names">
                  {getPairName(match.pair2_id)}
                </div>
              </div>
            </div>
          </div>

          {/* Juegos */}
          <div className="modern-score-editor-games-section">
            <div className="modern-score-editor-games-header">
              <div className="modern-score-editor-games-title">
                <span>🎾</span>
                Juegos ({games.length})
              </div>
              <button
                className="modern-score-editor-add-game"
                onClick={addGame}
                disabled={loading}
              >
                <span>+</span>
                Agregar Juego
              </button>
            </div>

            {games.length === 0 ? (
              <div className="modern-score-editor-error">
                <p>No hay juegos. Haz clic en "Agregar Juego" para comenzar.</p>
              </div>
            ) : (
              <div className="modern-score-editor-games-list">
                {games.map((game, index) => (
                  <div key={game.id} className="modern-score-editor-game">
                    <div className="modern-score-editor-game-header">
                      <div className="modern-score-editor-game-title">
                        Juego {index + 1}
                      </div>
                      <button
                        className="modern-score-editor-remove-game"
                        onClick={() => removeGame(game.id)}
                      >
                        <span>🗑️</span>
                        Eliminar
                      </button>
                    </div>

                    <div className="modern-score-editor-score-container">
                      <div className="modern-score-editor-score-input">
                        <div className="modern-score-editor-pair-name">
                          {getPairName(match.pair1_id)}
                        </div>
                        <input
                          className="modern-score-editor-input"
                          type="number"
                          min="0"
                          value={game.pair1_games}
                          onChange={(e) =>
                            updateScore(
                              game.id,
                              parseInt(e.target.value) || 0,
                              game.pair2_games
                            )
                          }
                        />
                      </div>

                      <div className="modern-score-editor-separator">-</div>

                      <div className="modern-score-editor-score-input">
                        <div className="modern-score-editor-pair-name">
                          {getPairName(match.pair2_id)}
                        </div>
                        <input
                          className="modern-score-editor-input"
                          type="number"
                          min="0"
                          value={game.pair2_games}
                          onChange={(e) =>
                            updateScore(
                              game.id,
                              game.pair1_games,
                              parseInt(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="modern-score-editor-error">
              <p>❌ {error}</p>
            </div>
          )}

          {/* Botones */}
          <div className="modern-score-editor-actions">
            <button
              className="modern-score-editor-finish"
              onClick={finishMatch}
              disabled={loading || games.length === 0}
            >
              <span>🏆</span>
              {loading ? "Finalizando..." : "Finalizar Partido"}
            </button>
            <button className="modern-score-editor-cancel" onClick={onClose}>
              <span>✕</span>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
