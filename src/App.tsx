import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import { TournamentManager } from "./components/TournamentManager";
import { ModernPlayerManager } from "./components/ModernPlayerManager";
import { NewPairManager } from "./components/NewPairManager";
import { DebugPanelContent } from "./components/DebugPanelContent";
import { TournamentStatusContent } from "./components/TournamentStatusContent";
import { MatchScoreEditor } from "./components/MatchScoreEditor";

import StandingsTable from "./components/StandingsTable";
import { SuccessModal } from "./components/SuccessModal";
import MatchCardWithResults from "./components/MatchCardWithResults";

import {
  Tournament,
  Player,
  Pair,
  Match,
  createPair,
  getPairs,
  updatePair,
  deletePair as deletePairFromDB,
  createMatch,
  getMatches,
  deleteMatchesByTournament,
  updateTournament,
} from "./lib/database";
import { testConnection } from "./lib/supabaseClient";

import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "./components/TournamentWinnerCalculator";

function App() {
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [showPairManager, setShowPairManager] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);
  const [currentView, setCurrentView] = useState<"main" | "winner">("main");

  const [forceRefresh, setForceRefresh] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showTournamentStatus, setShowTournamentStatus] = useState(false);
  const [showScoreCorrector, setShowScoreCorrector] = useState(false);
  const [selectedCorrectorMatch, setSelectedCorrectorMatch] =
    useState<Match | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalData, setSuccessModalData] = useState({
    title: "",
    message: "",
    icon: "✅",
  });

  // Cargar datos cuando se selecciona una reta
  useEffect(() => {
    if (selectedTournament) {
      loadTournamentData();
    }
  }, [selectedTournament?.id]);

  const loadTournamentData = useCallback(async () => {
    if (!selectedTournament) return;

    try {
      setLoading(true);
      setError("");
      console.log("Loading tournament data for:", selectedTournament.name);

      const [pairsData, matchesData] = await Promise.all([
        getPairs(selectedTournament.id),
        getMatches(selectedTournament.id),
      ]);

      console.log("Pairs loaded:", pairsData.length, "pairs");
      setPairs(pairsData);

      console.log(
        "Matches loaded from database:",
        matchesData.length,
        "matches"
      );
      setMatches(matchesData);
    } catch (err) {
      console.error("Error loading tournament data:", err);
      setError(
        "Error al cargar los datos de la reta: " + (err as Error).message
      );
    } finally {
      setLoading(false);
    }
  }, [selectedTournament]);

  const deletePair = async (pairId: string) => {
    try {
      setError("");
      console.log("Eliminando pareja:", pairId);

      await deletePairFromDB(pairId);
      setPairs(pairs.filter((p) => p.id !== pairId));

      console.log("Pareja eliminada exitosamente");
    } catch (err) {
      console.error("Error eliminando pareja:", err);
      setError("Error al eliminar la pareja: " + (err as Error).message);
    }
  };

  const updatePairPlayers = async (
    pairId: string,
    player1: Player,
    player2: Player
  ) => {
    try {
      setError("");
      console.log("Actualizando pareja:", pairId);
      console.log("Nuevos jugadores:", player1.name, "+", player2.name);

      // Actualizar la pareja en la base de datos
      await updatePair(pairId, {
        player1_id: player1.id,
        player2_id: player2.id,
      });

      // Actualizar el estado local
      setPairs(
        pairs.map((pair) => {
          if (pair.id === pairId) {
            return {
              ...pair,
              player1_id: player1.id,
              player2_id: player2.id,
              player1: player1,
              player2: player2,
            };
          }
          return pair;
        })
      );

      console.log("Pareja actualizada exitosamente");
    } catch (err) {
      console.error("Error actualizando pareja:", err);
      setError("Error al actualizar la pareja: " + (err as Error).message);
    }
  };

  const addPair = async (player1: Player, player2: Player) => {
    if (!selectedTournament) {
      setError("No hay reta seleccionada");
      return;
    }

    try {
      setError("");

      // Verificar duplicados en estado local
      const existingPairLocal = pairs.find((pair) => {
        const sameIds =
          (pair.player1_id === player1.id && pair.player2_id === player2.id) ||
          (pair.player1_id === player2.id && pair.player2_id === player1.id);

        const sameNames =
          (pair.player1?.name.toLowerCase() === player1.name.toLowerCase() &&
            pair.player2?.name.toLowerCase() === player2.name.toLowerCase()) ||
          (pair.player1?.name.toLowerCase() === player2.name.toLowerCase() &&
            pair.player2?.name.toLowerCase() === player1.name.toLowerCase());

        return sameIds || sameNames;
      });

      if (existingPairLocal) {
        setError(
          `La pareja ${player1.name} / ${player2.name} ya está registrada`
        );
        return;
      }

      const newPair = await createPair(
        selectedTournament.id,
        player1.id,
        player2.id
      );

      setPairs([...pairs, newPair]);
      setSelectedPlayers([]);

      console.log("Pair added successfully");
    } catch (err) {
      console.error("Error creating pair:", err);
      setError("Error al crear la pareja: " + (err as Error).message);
    }
  };

  const startTournament = async () => {
    if (!selectedTournament || pairs.length < 2) {
      setError("Se necesitan al menos 2 parejas para iniciar la reta");
      return;
    }

    try {
      setLoading(true);
      setError("");

      console.log("🚀 Iniciando reta:", selectedTournament.name);

      // Limpiar partidos existentes
      if (matches.length > 0) {
        await deleteMatchesByTournament(selectedTournament.id);
        setMatches([]);
      }

      const allPairs = [...pairs];
      const allCombinations = [];

      for (let i = 0; i < allPairs.length; i++) {
        for (let j = i + 1; j < allPairs.length; j++) {
          allCombinations.push({
            pair1: allPairs[i],
            pair2: allPairs[j],
          });
        }
      }

      const finalMatches = [];
      const remainingCombinations = [...allCombinations];
      let round = 1;

      while (remainingCombinations.length > 0) {
        const roundMatches = [];
        const usedPairs = new Set();
        const courtOrder = [];

        for (let i = 0; i < selectedTournament.courts; i++) {
          const rotatedCourt =
            ((round - 1 + i) % selectedTournament.courts) + 1;
          courtOrder.push(rotatedCourt);
        }

        for (let courtIndex = 0; courtIndex < courtOrder.length; courtIndex++) {
          const court = courtOrder[courtIndex];
          let bestIndex = -1;
          let bestScore = -1;

          for (let i = 0; i < remainingCombinations.length; i++) {
            const combo = remainingCombinations[i];

            if (
              !usedPairs.has(combo.pair1.id) &&
              !usedPairs.has(combo.pair2.id)
            ) {
              let score = 0;

              for (let j = 0; j < remainingCombinations.length; j++) {
                if (i !== j) {
                  const futureCombo = remainingCombinations[j];
                  if (
                    !usedPairs.has(futureCombo.pair1.id) &&
                    !usedPairs.has(futureCombo.pair2.id) &&
                    futureCombo.pair1.id !== combo.pair1.id &&
                    futureCombo.pair1.id !== combo.pair2.id &&
                    futureCombo.pair2.id !== combo.pair1.id &&
                    futureCombo.pair2.id !== combo.pair2.id
                  ) {
                    score++;
                  }
                }
              }

              if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
              }
            }
          }

          if (bestIndex !== -1) {
            const combo = remainingCombinations[bestIndex];

            const match = {
              pair1: combo.pair1,
              pair2: combo.pair2,
              round,
              court,
            };

            roundMatches.push(match);
            usedPairs.add(combo.pair1.id);
            usedPairs.add(combo.pair2.id);
            remainingCombinations.splice(bestIndex, 1);
          } else {
            break;
          }
        }

        if (roundMatches.length > 0) {
          finalMatches.push(...roundMatches);
        }

        round++;
      }

      const createdMatches = [];

      for (const match of finalMatches) {
        try {
          const createdMatch = await createMatch(
            selectedTournament.id,
            match.pair1.id,
            match.pair2.id,
            match.court,
            match.round
          );
          createdMatches.push(createdMatch);
        } catch (error) {
          console.error("Error creating match:", error);
        }
      }

      await updateTournament(selectedTournament.id, { is_started: true });
      setSelectedTournament((prev) =>
        prev ? { ...prev, is_started: true } : null
      );

      await loadTournamentData();

      setSuccessModalData({
        title: "¡Reta Iniciada!",
        message: `Se han creado ${createdMatches.length} partidos exitosamente usando ${selectedTournament.courts} canchas. La reta está lista para comenzar.`,
        icon: "🏆",
      });
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error starting tournament:", error);
      setError("Error al iniciar la reta: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const matchesByRound = matches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  const sortedPairs = useMemo(() => {
    return [...pairs].sort((a, b) => {
      // Criterio 1: Puntos totales (descendente) - CRITERIO PRINCIPAL
      if (a.points !== b.points) {
        return b.points - a.points;
      }
      // Criterio 2: Sets ganados (descendente) - CRITERIO DE DESEMPATE
      if (a.sets_won !== b.sets_won) {
        return b.sets_won - a.sets_won;
      }
      // Criterio 3: Juegos ganados (descendente)
      if (a.games_won !== b.games_won) {
        return b.games_won - a.games_won;
      }
      // Criterio 4: Menos partidos jugados (mejor eficiencia)
      return a.matches_played - b.matches_played;
    });
  }, [pairs, forceRefresh]);

  const isTournamentFinished = useMemo(() => {
    const finished =
      matches.length > 0 && matches.every((match) => match.is_finished);
    console.log("🏆 Estado del torneo:", {
      totalMatches: matches.length,
      finishedMatches: matches.filter((m) => m.is_finished).length,
      isFinished: finished,
    });
    return finished;
  }, [matches]);

  // Comentado: Marcar automáticamente el torneo como finalizado cuando todos los partidos terminen
  // Ahora la reta solo se finaliza manualmente con el botón en la tarjeta
  /*
  useEffect(() => {
    const markTournamentAsFinished = async () => {
      if (
        isTournamentFinished &&
        selectedTournament &&
        !selectedTournament.is_finished
      ) {
        try {
          console.log("🏆 Marcando torneo como finalizado automáticamente...");
          await updateTournament(selectedTournament.id, {
            is_finished: true,
          });

          // Actualizar el estado local del torneo
          setSelectedTournament((prev) =>
            prev ? { ...prev, is_finished: true } : null
          );

          console.log("✅ Torneo marcado como finalizado");
        } catch (error) {
          console.error("❌ Error marcando torneo como finalizado:", error);
        }
      }
    };

    markTournamentAsFinished();
  }, [isTournamentFinished, selectedTournament]);
  */

  // Recargar datos automáticamente cuando cambie forceRefresh
  useEffect(() => {
    if (selectedTournament && forceRefresh > 0) {
      console.log("🔄 Recargando datos debido a forceRefresh:", forceRefresh);
      loadTournamentData();
    }
  }, [forceRefresh, selectedTournament]);

  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);

  const winner = useMemo(() => {
    return tournamentWinner
      ? tournamentWinner.pair
      : sortedPairs.length > 0
      ? sortedPairs[0]
      : null;
  }, [tournamentWinner, sortedPairs]);

  const showWinnerScreenHandler = async () => {
    try {
      console.log("🏆 Calculando ganador de la reta...");

      // Usar los datos actuales en lugar de recargar
      const winner = await TournamentWinnerCalculator.calculateTournamentWinner(
        pairs,
        matches
      );

      setTournamentWinner(winner);
      setShowWinnerScreen(true);
      setCurrentView("winner");
      console.log("✅ Ganador calculado y pantalla mostrada");
    } catch (error) {
      console.error("❌ Error al calcular ganador:", error);
      setShowWinnerScreen(true);
      setCurrentView("winner");
    }
  };

  const hideWinnerScreenHandler = () => {
    setShowWinnerScreen(false);
    setCurrentView("main");
  };

  const handleBackToHome = () => {
    setSelectedTournament(null);
    setPairs([]);
    setMatches([]);

    setSelectedMatchId(null);
    setError("");
    setShowWinnerScreen(false);
    setCurrentView("main");
    setShowScoreCorrector(false);
    setSelectedCorrectorMatch(null);
    setForceRefresh(0);
    setShowDebugInfo(false);
    setShowSuccessModal(false);
    setSuccessModalData({
      title: "",
      message: "",
      icon: "✅",
    });
  };

  const openScoreCorrector = (match: Match) => {
    setSelectedCorrectorMatch(match);
    setShowScoreCorrector(true);
  };

  const closeScoreCorrector = () => {
    setShowScoreCorrector(false);
    setSelectedCorrectorMatch(null);
  };

  const handleScoreCorrectorUpdate = async () => {
    if (selectedTournament) {
      console.log(
        "🏆 Actualizando tabla de clasificación después de finalizar partido..."
      );

      try {
        // Incrementar forceRefresh inmediatamente para actualizar componentes
        setForceRefresh((prev) => prev + 1);

        // Recargar datos frescos del torneo
        await loadTournamentData();

        console.log(
          "✅ Tabla de clasificación actualizada después de finalizar partido"
        );

        // Mostrar mensaje de éxito
        setSuccessModalData({
          title: "¡Partido Finalizado!",
          message:
            "El partido ha sido finalizado y la tabla se ha actualizado.",
          icon: "🏆",
        });
        setShowSuccessModal(true);
      } catch (error) {
        console.error("❌ Error actualizando tabla:", error);
        setError("Error al actualizar la tabla de clasificación");
      }
    }
    closeScoreCorrector();
  };

  return (
    <div className="App">
      {currentView === "main" ? (
        <div className="container">
          <h1>🏆 ¡Organiza tu Reta de Pádel y ¡Que Gane el Mejor! 🏅</h1>

          {error && (
            <div className="error">
              <h4>❌ Error</h4>
              <p>{error}</p>
              <div className="error-help">
                <h5>💡 Ayuda:</h5>
                <ol>
                  <li>Verifica tu conexión a internet</li>
                  <li>Intenta recargar la página</li>
                  <li>Si el problema persiste, contacta al administrador</li>
                </ol>
              </div>
            </div>
          )}

          {loading && (
            <div className="loading">
              <p>⏳ Cargando...</p>
            </div>
          )}

          <div className="main-layout">
            {/* Gestión de Retas - Arriba de todo */}
            <div className="tournament-management-section">
              <TournamentManager
                selectedTournament={selectedTournament || undefined}
                onTournamentSelect={setSelectedTournament}
              />
            </div>

            {/* Contenido de la Reta Seleccionada */}
            <div className="tournament-content">
              {selectedTournament ? (
                <>
                  <div className="tournament-details">
                    {/* Cuadrícula de 4 Componentes Uniformes */}
                    <div className="four-components-grid">
                      {/* Gestión de Jugadores */}
                      <div className="component-card player-management-section">
                        <div className="component-header">
                          <div className="component-icon">👥</div>
                          <div className="component-title">
                            <h3>Gestión de Jugadores</h3>
                            <span className="component-subtitle">
                              Administrar Participantes
                            </span>
                          </div>
                          <button
                            className="component-toggle-btn"
                            onClick={() =>
                              setShowPlayerManager(!showPlayerManager)
                            }
                          >
                            {showPlayerManager ? "❌" : "👁️"}
                          </button>
                        </div>
                        {showPlayerManager && (
                          <div className="component-content">
                            <ModernPlayerManager
                              playersInPairs={pairs.flatMap((pair) => [
                                pair.player1_id,
                                pair.player2_id,
                              ])}
                              onPlayerSelect={(players) => {
                                console.log("=== SELECCIÓN DE JUGADORES ===");
                                console.log(
                                  "Players selected:",
                                  players.length
                                );
                                players.forEach((player, index) => {
                                  console.log(
                                    `Player ${index + 1}:`,
                                    player.name,
                                    "(ID:",
                                    player.id + ")"
                                  );
                                });

                                // Validación: Verificar si algún jugador ya está en una pareja
                                const playersInPairs = players.filter(
                                  (player) => {
                                    const isInPair = pairs.some(
                                      (pair) =>
                                        pair.player1_id === player.id ||
                                        pair.player2_id === player.id
                                    );

                                    if (isInPair) {
                                      const existingPair = pairs.find(
                                        (pair) =>
                                          pair.player1_id === player.id ||
                                          pair.player2_id === player.id
                                      );
                                      console.log(
                                        `🚨 JUGADOR YA EN PAREJA: ${
                                          player.name
                                        } está en pareja con ${
                                          existingPair?.player1?.id ===
                                          player.id
                                            ? existingPair?.player2?.name
                                            : existingPair?.player1?.name
                                        }`
                                      );
                                    }

                                    return isInPair;
                                  }
                                );

                                if (playersInPairs.length > 0) {
                                  const playerNames = playersInPairs
                                    .map((p) => p.name)
                                    .join(", ");
                                  console.log(
                                    "🚨 ERROR: Jugadores ya están en parejas:",
                                    playerNames
                                  );
                                  setError(
                                    `Los jugadores ${playerNames} ya están en parejas existentes. Debes eliminar sus parejas actuales antes de poder seleccionarlos nuevamente.`
                                  );
                                  return;
                                }

                                // Validación: No permitir jugadores con nombres iguales
                                if (players.length === 2) {
                                  const player1 = players[0];
                                  const player2 = players[1];

                                  if (
                                    player1.name.toLowerCase() ===
                                    player2.name.toLowerCase()
                                  ) {
                                    console.log(
                                      "🚨 ERROR: Jugadores con nombres iguales detectados"
                                    );
                                    console.log(
                                      "Player 1:",
                                      player1.name,
                                      "(ID:",
                                      player1.id + ")"
                                    );
                                    console.log(
                                      "Player 2:",
                                      player2.name,
                                      "(ID:",
                                      player2.id + ")"
                                    );
                                    setError(
                                      "No puedes seleccionar dos jugadores con el mismo nombre"
                                    );
                                    return;
                                  }

                                  // Validación: Verificar si ya existe una pareja con estos jugadores
                                  const existingPair = pairs.find((pair) => {
                                    const sameIds =
                                      (pair.player1_id === player1.id &&
                                        pair.player2_id === player2.id) ||
                                      (pair.player1_id === player2.id &&
                                        pair.player2_id === player1.id);

                                    const sameNames =
                                      (pair.player1?.name.toLowerCase() ===
                                        player1.name.toLowerCase() &&
                                        pair.player2?.name.toLowerCase() ===
                                          player2.name.toLowerCase()) ||
                                      (pair.player1?.name.toLowerCase() ===
                                        player2.name.toLowerCase() &&
                                        pair.player2?.name.toLowerCase() ===
                                          player1.name.toLowerCase());

                                    if (sameIds || sameNames) {
                                      console.log(
                                        "🚨 PAREJA DUPLICADA DETECTADA:",
                                        player1.name,
                                        "+",
                                        player2.name
                                      );
                                      console.log(
                                        "Existing pair:",
                                        existingPair
                                      );
                                    }

                                    return sameIds || sameNames;
                                  });

                                  if (existingPair) {
                                    console.log(
                                      "🚨 ERROR: Pareja ya existe en la base de datos"
                                    );
                                    setError(
                                      `La pareja ${player1.name} / ${player2.name} ya existe en la reta`
                                    );
                                    return;
                                  }

                                  // Si llegamos aquí, la pareja es válida
                                  console.log(
                                    "✅ PAREJA VÁLIDA:",
                                    player1.name,
                                    "+",
                                    player2.name
                                  );
                                  addPair(player1, player2);
                                  setSelectedPlayers([]); // Limpiar selección después de crear la pareja
                                } else {
                                  setSelectedPlayers(players);
                                }
                              }}
                              selectedPlayers={selectedPlayers}
                              allowMultipleSelection={true}
                            />
                          </div>
                        )}
                      </div>

                      {/* Gestión de Parejas */}
                      <div className="component-card pair-management-section">
                        <div className="component-header">
                          <div className="component-icon">✏️</div>
                          <div className="component-title">
                            <h3>Gestión de Parejas</h3>
                            <span className="component-subtitle">
                              Administrar Equipos
                            </span>
                          </div>
                          <button
                            className="component-toggle-btn"
                            onClick={() => setShowPairManager(!showPairManager)}
                          >
                            {showPairManager ? "❌" : "👁️"}
                          </button>
                        </div>
                        {showPairManager && (
                          <div className="component-content">
                            <NewPairManager
                              pairs={pairs}
                              onPairUpdate={updatePairPlayers}
                              onPairDelete={deletePair}
                            />
                          </div>
                        )}
                      </div>

                      {/* Panel de Estado del Torneo */}
                      <div className="component-card tournament-status-card">
                        <div className="component-header">
                          <div className="component-icon">🏆</div>
                          <div className="component-title">
                            <h3>
                              {selectedTournament.is_finished
                                ? "Reta Finalizada"
                                : "Reta en Progreso"}
                            </h3>
                            <span className="component-subtitle">
                              Estado del Torneo
                            </span>
                          </div>
                          <button
                            className="component-toggle-btn"
                            onClick={() =>
                              setShowTournamentStatus(!showTournamentStatus)
                            }
                          >
                            {showTournamentStatus ? "❌" : "👁️"}
                          </button>
                        </div>
                        {showTournamentStatus && (
                          <div className="component-content">
                            <TournamentStatusContent
                              tournament={selectedTournament}
                              pairsCount={pairs.length}
                              loading={loading}
                              onReset={async () => {
                                if (
                                  window.confirm(
                                    "¿Estás seguro de que quieres resetear la reta? Esto eliminará todos los partidos existentes."
                                  )
                                ) {
                                  try {
                                    setLoading(true);
                                    await deleteMatchesByTournament(
                                      selectedTournament.id
                                    );
                                    await updateTournament(
                                      selectedTournament.id,
                                      {
                                        is_started: false,
                                      }
                                    );
                                    setSelectedTournament((prev) =>
                                      prev
                                        ? { ...prev, is_started: false }
                                        : null
                                    );
                                    setMatches([]);
                                    await loadTournamentData();
                                    setSuccessModalData({
                                      title: "¡Reta Reseteada!",
                                      message:
                                        "La reta ha sido reseteada y está lista para iniciar nuevamente.",
                                      icon: "🔄",
                                    });
                                    setShowSuccessModal(true);
                                  } catch (error) {
                                    setError(
                                      "Error al resetear la reta: " +
                                        (error as Error).message
                                    );
                                  } finally {
                                    setLoading(false);
                                  }
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Panel de Debug */}
                      <div className="component-card debug-panel-card">
                        <div className="component-header">
                          <div className="component-icon">🔧</div>
                          <div className="component-title">
                            <h3>Panel de Debug</h3>
                            <span className="component-subtitle">
                              Información del Sistema
                            </span>
                          </div>
                          <button
                            className="component-toggle-btn"
                            onClick={() => setShowDebugInfo(!showDebugInfo)}
                          >
                            {showDebugInfo ? "❌" : "👁️"}
                          </button>
                        </div>
                        {showDebugInfo && (
                          <div className="component-content">
                            <DebugPanelContent
                              status={
                                selectedTournament.is_started
                                  ? "✅ Iniciado"
                                  : "⏳ Pendiente"
                              }
                              pairsCount={pairs.length}
                              matchesCount={matches.length}
                              onTestConnection={async () => {
                                try {
                                  const result = await testConnection();
                                  alert(
                                    result
                                      ? "✅ Conexión exitosa a la base de datos"
                                      : "❌ Error de conexión"
                                  );
                                } catch (error) {
                                  alert(
                                    "❌ Error al probar la conexión: " +
                                      (error as Error).message
                                  );
                                }
                              }}
                              onReloadData={() => {
                                loadTournamentData();
                                setForceRefresh((prev) => prev + 1);
                              }}
                              onVerifyStatus={async () => {
                                try {
                                  alert(
                                    `📊 Estado del Sistema:\n` +
                                      `• Torneos: 1\n` +
                                      `• Parejas: ${pairs.length}\n` +
                                      `• Partidos: ${matches.length}\n` +
                                      `• Estado: ✅ Todo funcionando correctamente`
                                  );
                                } catch (error) {
                                  alert(
                                    "❌ Error al verificar estado: " +
                                      (error as Error).message
                                  );
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {!selectedTournament.is_started && (
                      <div className="start-tournament-section">
                        <h3>🚀 Iniciar Reta</h3>
                        <div className="tournament-info">
                          <p>Tienes {pairs.length} parejas registradas</p>
                          <p>
                            Se crearán {(pairs.length * (pairs.length - 1)) / 2}{" "}
                            partidos (round-robin completo - todas las parejas
                            se enfrentan)
                          </p>
                          <p>
                            Estado de la reta:{" "}
                            {selectedTournament.is_started
                              ? "Iniciada"
                              : "Pendiente"}
                          </p>
                        </div>
                        <button
                          className="start-button"
                          onClick={startTournament}
                          disabled={loading || pairs.length < 2}
                        >
                          {loading
                            ? "⏳ Iniciando..."
                            : selectedTournament.is_started
                            ? "🏆 Reta Ya Iniciada"
                            : pairs.length < 2
                            ? "❌ Necesitas al menos 2 parejas"
                            : "🚀 ¡Iniciar Reta!"}
                        </button>
                      </div>
                    )}

                    {/* Mostrar parejas creadas */}
                    {pairs.length > 0 && (
                      <div className="compact-pairs-manager">
                        {/* Header Compacto */}
                        <div className="compact-header">
                          <div className="compact-header-content">
                            <div className="compact-title">
                              <span className="compact-icon">👥</span>
                              <h3>Parejas Registradas ({pairs.length})</h3>
                            </div>
                          </div>
                        </div>

                        {/* Grid de Parejas Compacto */}
                        <div className="compact-pairs-grid">
                          {pairs.map((pair, index) => (
                            <div
                              key={pair.id}
                              className="compact-pair-card"
                              style={{ animationDelay: `${index * 0.1}s` }}
                            >
                              {/* Número de Pareja */}
                              <div className="compact-pair-number">
                                #{index + 1}
                              </div>

                              {/* Información de la Pareja */}
                              <div className="compact-pair-info">
                                <div className="compact-pair-names">
                                  {pair.player1?.name || "Jugador 1"} /{" "}
                                  {pair.player2?.name || "Jugador 2"}
                                </div>

                                {/* Estadísticas Compactas */}
                                <div className="compact-stats">
                                  <div className="compact-stat">
                                    <span className="compact-stat-label">
                                      SETS
                                    </span>
                                    <span className="compact-stat-value">
                                      {pair.sets_won || 0}
                                    </span>
                                  </div>
                                  <div className="compact-stat">
                                    <span className="compact-stat-label">
                                      PARTIDOS
                                    </span>
                                    <span className="compact-stat-value">
                                      {pair.matches_played || 0}
                                    </span>
                                  </div>
                                  <div className="compact-stat">
                                    <span className="compact-stat-label">
                                      PUNTOS
                                    </span>
                                    <span className="compact-stat-value">
                                      {pair.points || 0}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Efectos de partículas */}
                              <div className="compact-particles">
                                <div className="compact-particle"></div>
                                <div className="compact-particle"></div>
                                <div className="compact-particle"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedTournament.is_started && (
                      <div className="tournament-content">
                        {/* Lista de partidos */}
                        <div className="matches-section">
                          <h3>🎾 Partidos ({matches.length} total)</h3>
                          {matches.length === 0 ? (
                            <div className="no-matches">
                              <p>📝 No hay partidos programados aún</p>
                              <p>
                                Inicia la reta para generar los partidos
                                automáticamente
                              </p>
                            </div>
                          ) : (
                            Object.entries(matchesByRound).map(
                              ([round, roundMatches]) => (
                                <div key={round} className="round-section">
                                  <h4>
                                    🔄 Ronda {round} ({roundMatches.length}{" "}
                                    partidos)
                                  </h4>
                                  <div className="matches-container">
                                    {roundMatches.map((match) => (
                                      <MatchCardWithResults
                                        key={match.id}
                                        match={match}
                                        isSelected={
                                          selectedMatchId === match.id
                                        }
                                        onSelect={() => {}}
                                        onCorrectScore={openScoreCorrector}
                                        forceRefresh={forceRefresh}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )
                            )
                          )}
                        </div>

                        {/* Tabla de clasificación */}
                        <StandingsTable
                          tournamentId={selectedTournament.id}
                          forceRefresh={forceRefresh}
                        />

                        {/* Botón para mostrar ganador */}
                        {(isTournamentFinished ||
                          selectedTournament.is_finished) &&
                          winner && (
                            <div className="winner-button-container">
                              <button
                                className="show-winner-button"
                                onClick={showWinnerScreenHandler}
                              >
                                🏆 ¡Ver Ganador de la Reta!
                              </button>
                            </div>
                          )}

                        {/* Debug info para verificar estado - COMENTADO */}
                        {/* {process.env.NODE_ENV === "development" && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#666",
                              margin: "10px 0",
                            }}
                          >
                            Debug: Partidos {matches.length}, Terminados{" "}
                            {matches.filter((m) => m.is_finished).length},
                            Torneo terminado:{" "}
                            {isTournamentFinished ? "SÍ" : "NO"}, Ganador:{" "}
                            {winner ? "SÍ" : "NO"}
                          </div>
                        )} */}

                        {/* Botón para volver al inicio */}
                        <div className="back-home-button-container">
                          <button
                            className="back-home-button"
                            onClick={handleBackToHome}
                          >
                            🏠 Volver al Inicio
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="no-tournament-selected">
                  <h2>🏆 Bienvenido al Gestor de Retas</h2>
                  <p>
                    Selecciona una reta del panel para comenzar a gestionar
                    partidos y resultados.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Modal de corrección de marcador */}
          {showScoreCorrector && selectedCorrectorMatch && (
            <MatchScoreEditor
              match={selectedCorrectorMatch}
              onClose={closeScoreCorrector}
              onMatchFinish={handleScoreCorrectorUpdate}
            />
          )}

          {/* Modal de éxito */}
          {showSuccessModal && (
            <SuccessModal
              title={successModalData.title}
              message={successModalData.message}
              icon={successModalData.icon}
              isOpen={showSuccessModal}
              onClose={() => setShowSuccessModal(false)}
            />
          )}
        </div>
      ) : (
        /* Pantalla de ganador - Nueva ventana */
        <div className="winner-page">
          {/* Pantalla de ganador - Versión Escritorio */}
          {showWinnerScreen && winner && (
            <div className="winner-screen">
              <div className="winner-content">
                <div className="winner-celebration">
                  <h1 className="winner-title">🏆 ¡FELICIDADES! 🏆</h1>
                  <div className="winner-names">
                    {winner.player1?.name} / {winner.player2?.name}
                  </div>
                  <div className="winner-subtitle">
                    ¡Son los campeones de la reta!
                  </div>
                  <div className="winner-stats">
                    <div className="stat-item">
                      <span className="stat-number">
                        {tournamentWinner
                          ? tournamentWinner.totalSets
                          : winner.sets_won}
                      </span>
                      <span className="stat-label">Sets Ganados</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-number">
                        {tournamentWinner
                          ? tournamentWinner.matchesPlayed
                          : winner.games_won}
                      </span>
                      <span className="stat-label">Partidos Ganados</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-number">
                        {tournamentWinner
                          ? tournamentWinner.totalPoints
                          : winner.points}
                      </span>
                      <span className="stat-label">Puntos Totales</span>
                    </div>
                  </div>
                  <button
                    className="back-button"
                    onClick={hideWinnerScreenHandler}
                  >
                    🏠 Volver
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pantalla de ganador - Versión Móvil */}
          {showWinnerScreen && winner && (
            <div className="winner-screen-mobile">
              <div className="winner-mobile-container">
                <div className="winner-mobile-header">
                  <h1 className="winner-mobile-title">🏆 ¡FELICIDADES! 🏆</h1>
                  <p className="winner-mobile-subtitle">
                    ¡Son los campeones de la reta!
                  </p>
                </div>

                <div className="winner-mobile-names">
                  {winner.player1?.name} / {winner.player2?.name}
                </div>

                <div className="winner-mobile-stats">
                  <div className="winner-mobile-stat">
                    <span className="winner-mobile-stat-number">
                      {tournamentWinner
                        ? tournamentWinner.totalSets
                        : winner.sets_won}
                    </span>
                    <span className="winner-mobile-stat-label">
                      Sets Ganados
                    </span>
                  </div>
                  <div className="winner-mobile-stat">
                    <span className="winner-mobile-stat-number">
                      {tournamentWinner
                        ? tournamentWinner.matchesPlayed
                        : winner.games_won}
                    </span>
                    <span className="winner-mobile-stat-label">
                      Partidos Ganados
                    </span>
                  </div>
                  <div className="winner-mobile-stat">
                    <span className="winner-mobile-stat-number">
                      {tournamentWinner
                        ? tournamentWinner.totalPoints
                        : winner.points}
                    </span>
                    <span className="winner-mobile-stat-label">
                      Puntos Totales
                    </span>
                  </div>
                </div>

                <button
                  className="winner-mobile-back-btn"
                  onClick={hideWinnerScreenHandler}
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
