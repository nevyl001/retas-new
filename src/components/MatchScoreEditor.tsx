import React, { useState, useEffect } from "react";
import { Match, Game, Pair } from "../lib/database";
import {
  getGames,
  createGame,
  updateGame,
  deleteGame,
  getPairs,
} from "../lib/database";

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

  // Cargar juegos y parejas al montar el componente
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log("🔄 Cargando datos del editor de marcador...");

        // Cargar juegos del partido
        const matchGames = await getGames(match.id);
        console.log(`📊 Juegos cargados: ${matchGames.length}`);
        setGames(matchGames);

        // Cargar parejas del torneo
        const allPairs = await getPairs(match.tournament_id);
        console.log(`👥 Parejas cargadas: ${allPairs.length}`);
        setPairs(allPairs);
      } catch (err) {
        console.error("❌ Error cargando datos:", err);
        setError("Error al cargar los datos");
      }
    };

    loadData();
  }, [match.id, match.tournament_id]);

  // Agregar nuevo juego
  const addGame = async () => {
    try {
      setLoading(true);
      setError("");

      console.log(
        `➕ Agregando juego ${games.length + 1} al partido ${match.id}`
      );

      const newGame = await createGame(match.id, games.length + 1);
      console.log(`✅ Juego creado: ${newGame.id}`);

      setGames((prevGames) => {
        const updatedGames = [...prevGames, newGame];
        console.log(
          `📊 Total de juegos después de agregar: ${updatedGames.length}`
        );
        return updatedGames;
      });
    } catch (err) {
      console.error("❌ Error agregando juego:", err);
      setError("Error al agregar juego");
    } finally {
      setLoading(false);
    }
  };

  // CORREGIR puntuación de un juego específico (NO acumula estadísticas)
  const correctGameScore = async (
    gameId: string,
    pair1Games: number,
    pair2Games: number,
    isTieBreak: boolean = false
  ) => {
    try {
      console.log(
        `🔄 CORRIGIENDO juego ${gameId}: ${pair1Games}-${pair2Games}`
      );
      console.log(`📊 Juegos antes de corregir: ${games.length}`);

      // SOLO actualizar el juego en la base de datos
      await updateGame(gameId, {
        pair1_games: pair1Games,
        pair2_games: pair2Games,
        is_tie_break: isTieBreak,
      });

      // Actualizar estado local
      setGames((prevGames) => {
        const updatedGames = prevGames.map((game) =>
          game.id === gameId
            ? {
                ...game,
                pair1_games: pair1Games,
                pair2_games: pair2Games,
                is_tie_break: isTieBreak,
              }
            : game
        );

        console.log(`📊 Juegos después de corregir: ${updatedGames.length}`);
        console.log(
          `✅ Juego ${gameId} corregido correctamente - NO se acumularon estadísticas`
        );

        return updatedGames;
      });

      // CRÍTICO: NO llamar a onMatchFinish() aquí
      // Solo se llama cuando se finaliza el partido
      console.log("🚫 NO se llama onMatchFinish() al corregir juego");
    } catch (err) {
      console.error("❌ Error corrigiendo juego:", err);
      setError("Error al corregir puntuación");
    }
  };

  // Eliminar juego
  const removeGame = async (gameId: string) => {
    try {
      setLoading(true);
      setError("");

      console.log(`🗑️ Eliminando juego ${gameId}`);

      await deleteGame(gameId);

      setGames((prevGames) => {
        const updatedGames = prevGames.filter((game) => game.id !== gameId);
        console.log(`📊 Juegos después de eliminar: ${updatedGames.length}`);
        return updatedGames;
      });

      // CRÍTICO: NO llamar a onMatchFinish() aquí
      console.log("🚫 NO se llama onMatchFinish() al eliminar juego");
    } catch (err) {
      console.error("❌ Error eliminando juego:", err);
      setError("Error al eliminar juego");
    } finally {
      setLoading(false);
    }
  };

  // Cambiar tipo de juego (normal/tie-break)
  const toggleTieBreak = async (gameId: string) => {
    const game = games.find((g) => g.id === gameId);
    if (game) {
      await correctGameScore(
        gameId,
        game.pair1_games,
        game.pair2_games,
        !game.is_tie_break
      );
    }
  };

  // RECALCULAR todas las estadísticas del torneo desde cero (OPTIMIZADO)
  const recalculateAllTournamentStatistics = async () => {
    try {
      console.log("🔄 RECALCULANDO todas las estadísticas del torneo...");

      // Obtener todos los partidos del torneo
      const { getMatches } = await import("../lib/database");
      const allMatches = await getMatches(match.tournament_id);
      const finishedMatches = allMatches.filter((m) => m.is_finished);

      console.log(
        `📊 Partidos finalizados encontrados: ${finishedMatches.length}`
      );

      // Crear un mapa de estadísticas para cada pareja
      const pairStats = new Map<
        string,
        {
          games_won: number;
          sets_won: number;
          points: number;
          matches_played: number;
        }
      >();

      // Inicializar estadísticas en cero para todas las parejas
      for (const pair of pairs) {
        pairStats.set(pair.id, {
          games_won: 0,
          sets_won: 0,
          points: 0,
          matches_played: 0,
        });
      }

      // Recalcular estadísticas de cada partido finalizado
      for (const finishedMatch of finishedMatches) {
        const matchGames = await getGames(finishedMatch.id);

        let pair1TotalPoints = 0;
        let pair2TotalPoints = 0;
        let pair1GamesWon = 0;
        let pair2GamesWon = 0;
        let pair1SetsWon = 0;
        let pair2SetsWon = 0;

        // Calcular estadísticas del partido
        matchGames.forEach((game) => {
          if (game.is_tie_break) {
            // Tie-break
            if (game.tie_break_pair1_points > game.tie_break_pair2_points) {
              pair1GamesWon++;
            } else if (
              game.tie_break_pair2_points > game.tie_break_pair1_points
            ) {
              pair2GamesWon++;
            }
            pair1TotalPoints += game.tie_break_pair1_points || 0;
            pair2TotalPoints += game.tie_break_pair2_points || 0;
          } else {
            // Juego normal
            if (game.pair1_games > game.pair2_games) {
              pair1GamesWon++;
            } else if (game.pair2_games > game.pair1_games) {
              pair2GamesWon++;
            }
            pair1TotalPoints += game.pair1_games;
            pair2TotalPoints += game.pair2_games;

            // Sets (6 puntos = 1 set)
            if (game.pair1_games >= 6) {
              pair1SetsWon++;
            }
            if (game.pair2_games >= 6) {
              pair2SetsWon++;
            }
          }
        });

        // Acumular estadísticas en el mapa
        const pair1Stats = pairStats.get(finishedMatch.pair1_id);
        const pair2Stats = pairStats.get(finishedMatch.pair2_id);

        if (pair1Stats) {
          pair1Stats.games_won += pair1GamesWon;
          pair1Stats.sets_won += pair1SetsWon;
          pair1Stats.points += pair1TotalPoints;
          pair1Stats.matches_played += 1;
        }

        if (pair2Stats) {
          pair2Stats.games_won += pair2GamesWon;
          pair2Stats.sets_won += pair2SetsWon;
          pair2Stats.points += pair2TotalPoints;
          pair2Stats.matches_played += 1;
        }

        console.log(`✅ Partido ${finishedMatch.id} procesado`);
      }

      // Actualizar todas las parejas de una vez
      const { updatePair } = await import("../lib/database");
      const updatePromises = Array.from(pairStats.entries()).map(
        ([pairId, stats]) => updatePair(pairId, stats)
      );

      await Promise.all(updatePromises);

      console.log(
        "✅ Todas las estadísticas del torneo recalculadas correctamente"
      );
    } catch (err) {
      console.error("❌ Error recalculando estadísticas:", err);
      setError("Error al recalcular estadísticas");
    }
  };

  // FINALIZAR partido (recalcula todas las estadísticas)
  const finishMatch = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("🏆 FINALIZANDO partido...");

      // Calcular estadísticas del partido actual
      let pair1TotalPoints = 0;
      let pair2TotalPoints = 0;
      let pair1GamesWon = 0;
      let pair2GamesWon = 0;
      let pair1SetsWon = 0;
      let pair2SetsWon = 0;

      games.forEach((game, index) => {
        console.log(
          `📊 Procesando juego ${index + 1}: ${game.pair1_games}-${
            game.pair2_games
          }`
        );

        if (game.is_tie_break) {
          // Tie-break
          if (game.tie_break_pair1_points > game.tie_break_pair2_points) {
            pair1GamesWon++;
          } else if (
            game.tie_break_pair2_points > game.tie_break_pair1_points
          ) {
            pair2GamesWon++;
          }
          pair1TotalPoints += game.tie_break_pair1_points || 0;
          pair2TotalPoints += game.tie_break_pair2_points || 0;
        } else {
          // Juego normal
          if (game.pair1_games > game.pair2_games) {
            pair1GamesWon++;
          } else if (game.pair2_games > game.pair1_games) {
            pair2GamesWon++;
          }
          pair1TotalPoints += game.pair1_games;
          pair2TotalPoints += game.pair2_games;

          // Sets (6 puntos = 1 set)
          if (game.pair1_games >= 6) {
            pair1SetsWon++;
          }
          if (game.pair2_games >= 6) {
            pair2SetsWon++;
          }
        }
      });

      console.log("📊 Estadísticas finales del partido:");
      console.log(
        `📊 Pareja 1: ${pair1GamesWon} juegos, ${pair1SetsWon} sets, ${pair1TotalPoints} puntos`
      );
      console.log(
        `📊 Pareja 2: ${pair2GamesWon} juegos, ${pair2SetsWon} sets, ${pair2TotalPoints} puntos`
      );

      // Determinar ganador
      let winnerId: string | undefined;
      const isTie = pair1TotalPoints === pair2TotalPoints;

      if (isTie) {
        winnerId = undefined;
        console.log("🤝 Partido terminó en EMPATE");
      } else if (pair1TotalPoints > pair2TotalPoints) {
        winnerId = match.pair1_id;
        console.log("🏆 Pareja 1 gana por puntos totales");
      } else {
        winnerId = match.pair2_id;
        console.log("🏆 Pareja 2 gana por puntos totales");
      }

      // Marcar partido como finalizado
      const { updateMatch } = await import("../lib/database");
      await updateMatch(match.id, {
        winner_id: winnerId,
        is_finished: true,
      });

      console.log("✅ Partido finalizado correctamente");

      // RECALCULAR todas las estadísticas del torneo
      await recalculateAllTournamentStatistics();

      // Llamar onMatchFinish() para actualizar tabla
      console.log(
        "🏆 Llamando onMatchFinish() para actualizar tabla de clasificación"
      );
      onMatchFinish();
      onClose();
    } catch (err) {
      console.error("❌ Error finalizando partido:", err);
      setError("Error al finalizar partido");
    } finally {
      setLoading(false);
    }
  };

  // Obtener nombres de pareja
  const getPairNames = (pairId: string) => {
    const pair = pairs.find((p) => p.id === pairId);
    if (pair) {
      return `${pair.player1?.name || "Jugador 1"} y ${
        pair.player2?.name || "Jugador 2"
      }`;
    }
    return "Pareja desconocida";
  };

  return (
    <div className="match-score-editor-overlay">
      <div className="match-score-editor-modal">
        {/* Header */}
        <div className="match-score-editor-header">
          <div className="match-score-editor-title">
            <span className="match-score-editor-icon">🎾</span>
            <h3>Editor de Marcador</h3>
          </div>
          <button className="match-score-editor-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="match-score-editor-content">
          {/* Información del partido */}
          <div className="match-score-editor-info">
            <h4>
              Partido {match.court} - Ronda {match.round}
            </h4>
            <div className="match-score-editor-pairs">
              <div className="match-score-editor-pair">
                <span className="match-score-editor-pair-label">
                  🏆 Pareja 1:
                </span>
                <span className="match-score-editor-pair-names">
                  {getPairNames(match.pair1_id)}
                </span>
              </div>
              <div className="match-score-editor-pair">
                <span className="match-score-editor-pair-label">
                  🏆 Pareja 2:
                </span>
                <span className="match-score-editor-pair-names">
                  {getPairNames(match.pair2_id)}
                </span>
              </div>
            </div>
          </div>

          {/* Reglas */}
          <div className="match-score-editor-rules">
            <h5>📋 Reglas del Juego:</h5>
            <ul>
              <li>
                <strong>Juegos:</strong> La pareja que haga más puntos gana el
                juego
              </li>
              <li>
                <strong>Sets:</strong> La pareja que llegue a 6 puntos gana 1
                set
              </li>
              <li>
                <strong>Empates:</strong> Si ambas parejas tienen los mismos
                puntos, es empate
              </li>
              <li>
                <strong>Tie-Breaks:</strong> Se pueden activar para desempates
                especiales
              </li>
            </ul>
          </div>

          {/* Sección de juegos */}
          <div className="match-score-editor-games-section">
            <div className="match-score-editor-games-header">
              <h5>🎾 Juegos ({games.length})</h5>
              <button
                className="match-score-editor-add-game-btn"
                onClick={addGame}
                disabled={loading}
              >
                + Agregar Juego
              </button>
            </div>

            {games.length === 0 ? (
              <div className="match-score-editor-no-games">
                <p>
                  No hay juegos registrados. Haz clic en "Agregar Juego" para
                  comenzar.
                </p>
              </div>
            ) : (
              <div className="match-score-editor-games-list">
                {games.map((game, index) => (
                  <div key={game.id} className="match-score-editor-game-card">
                    <div className="match-score-editor-game-header">
                      <h6>Juego {index + 1}</h6>
                      <div className="match-score-editor-game-actions">
                        <button
                          className="match-score-editor-tie-break-btn"
                          onClick={() => toggleTieBreak(game.id)}
                        >
                          {game.is_tie_break ? "🔗 Tie-Break" : "🔗 Normal"}
                        </button>
                        <button
                          className="match-score-editor-remove-game-btn"
                          onClick={() => removeGame(game.id)}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="match-score-editor-game-scores">
                      <div className="match-score-editor-score-input">
                        <label className="match-score-editor-pair-name-label">
                          {getPairNames(match.pair1_id)}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={game.pair1_games}
                          onChange={(e) =>
                            correctGameScore(
                              game.id,
                              parseInt(e.target.value) || 0,
                              game.pair2_games,
                              game.is_tie_break
                            )
                          }
                        />
                      </div>

                      <div className="match-score-editor-score-separator">
                        -
                      </div>

                      <div className="match-score-editor-score-input">
                        <label className="match-score-editor-pair-name-label">
                          {getPairNames(match.pair2_id)}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={game.pair2_games}
                          onChange={(e) =>
                            correctGameScore(
                              game.id,
                              game.pair1_games,
                              parseInt(e.target.value) || 0,
                              game.is_tie_break
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

          {/* Mensaje de error */}
          {error && (
            <div className="match-score-editor-error">
              <p>❌ {error}</p>
            </div>
          )}

          {/* Botones de acción */}
          <div className="match-score-editor-actions">
            <button
              className="match-score-editor-finish-btn"
              onClick={finishMatch}
              disabled={loading || games.length === 0}
            >
              {loading ? "⏳ Finalizando..." : "🏆 Finalizar Partido"}
            </button>
            <button className="match-score-editor-cancel-btn" onClick={onClose}>
              ❌ Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
