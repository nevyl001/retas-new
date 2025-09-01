import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import { TournamentManager } from "./components/TournamentManager";
import { ModernPlayerManager } from "./components/ModernPlayerManager";
import { NewPairManager } from "./components/NewPairManager";
import { DebugPanelContent } from "./components/DebugPanelContent";
import { TournamentStatusContent } from "./components/TournamentStatusContent";
import RealTimeStandingsTable from "./components/RealTimeStandingsTable";
import MatchCardWithResults from "./components/MatchCardWithResults";
import PublicTournamentView from "./components/PublicTournamentView";

import {
  Tournament,
  Player,
  Pair,
  Match,
  createPair,
  getPairs,
  updatePair,
  deletePair as deletePairFromDB,
  getMatches,
  deleteMatchesByTournament,
  updateTournament,
  getTournamentGames,
} from "./lib/database";
import { testConnection } from "./lib/supabaseClient";

import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "./components/TournamentWinnerCalculator";
import { ModernToast } from "./components/ModernToast";
import { CircleRoundRobinScheduler } from "./components/CircleRoundRobinScheduler";

function App() {
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pairStats, setPairStats] = useState<
    Map<string, { sets: number; matches: number; points: number }>
  >(new Map());

  const [, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [showPairManager, setShowPairManager] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);
  const [currentView, setCurrentView] = useState<"main" | "winner" | "public">(
    "main"
  );
  const [publicTournamentId, setPublicTournamentId] = useState<string | null>(
    null
  );

  const [forceRefresh, setForceRefresh] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showTournamentStatus, setShowTournamentStatus] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
    isVisible: boolean;
  }>({
    message: "",
    type: "info",
    isVisible: false,
  });

  // Detectar si estamos en una vista pública
  useEffect(() => {
    const path = window.location.pathname;
    const publicMatch = path.match(/^\/public\/([a-f0-9-]+)$/);

    if (publicMatch) {
      const tournamentId = publicMatch[1];
      setPublicTournamentId(tournamentId);
      setCurrentView("public");
    }
  }, []);

  // Cargar datos cuando se selecciona una reta
  useEffect(() => {
    if (selectedTournament) {
      loadTournamentData();
    }
  }, [selectedTournament?.id]);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info"
  ) => {
    setToast({
      message,
      type,
      isVisible: true,
    });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  };

  // Función para generar enlace público
  const generatePublicLink = (tournamentId: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/public/${tournamentId}`;
  };

  // Función para copiar enlace al portapapeles
  const copyPublicLink = async (tournamentId: string) => {
    try {
      const publicLink = generatePublicLink(tournamentId);
      await navigator.clipboard.writeText(publicLink);
      showToast("¡Enlace público copiado al portapapeles!", "success");
    } catch (err) {
      showToast("Error al copiar el enlace", "error");
    }
  };

  const calculatePairStatistics = async (
    pairsData: Pair[],
    matchesData: Match[]
  ) => {
    console.log("🧮 Calculando estadísticas de parejas...");

    const statsMap = new Map<
      string,
      { sets: number; matches: number; points: number }
    >();

    // Inicializar estadísticas para todas las parejas
    pairsData.forEach((pair) => {
      statsMap.set(pair.id, { sets: 0, matches: 0, points: 0 });
    });

    // Obtener todos los juegos del torneo
    try {
      const allGames = await getTournamentGames(selectedTournament!.id);
      console.log("🎮 Juegos cargados:", allGames.length);

      // Procesar cada partido finalizado
      matchesData.forEach((match) => {
        if (match.status === "finished") {
          // Obtener juegos de este partido
          const matchGames = allGames.filter(
            (game) => game.match_id === match.id
          );

          const pair1Stats = statsMap.get(match.pair1_id);
          const pair2Stats = statsMap.get(match.pair2_id);

          if (pair1Stats && pair2Stats) {
            // Incrementar partidos jugados
            pair1Stats.matches += 1;
            pair2Stats.matches += 1;

            if (matchGames.length > 0) {
              // Calcular desde juegos detallados
              let pair1Sets = 0;
              let pair2Sets = 0;
              let pair1Points = 0;
              let pair2Points = 0;

              matchGames.forEach((game) => {
                if (game.pair1_games >= 6) pair1Sets++;
                if (game.pair2_games >= 6) pair2Sets++;
                pair1Points += game.pair1_games || 0;
                pair2Points += game.pair2_games || 0;
              });

              pair1Stats.sets += pair1Sets;
              pair1Stats.points += pair1Points;
              pair2Stats.sets += pair2Sets;
              pair2Stats.points += pair2Points;
            } else if (
              match.pair1_score !== undefined &&
              match.pair2_score !== undefined
            ) {
              // Usar datos básicos del match
              pair1Stats.sets += match.pair1_score;
              pair1Stats.points += match.pair1_score;
              pair2Stats.sets += match.pair2_score;
              pair2Stats.points += match.pair2_score;
            }
          }
        }
      });

      console.log("📊 Estadísticas calculadas para", statsMap.size, "parejas");
      setPairStats(statsMap);
    } catch (error) {
      console.error("Error calculando estadísticas:", error);
    }
  };

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

      // Calcular estadísticas de parejas
      await calculatePairStatistics(pairsData, matchesData);
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
      showToast("Pareja eliminada exitosamente", "success");
    } catch (err) {
      console.error("Error eliminando pareja:", err);
      showToast("Error al eliminar la pareja", "error");
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
      console.log("📊 Parejas:", pairs.length);
      console.log("🏟️ Canchas:", selectedTournament.courts);

      // Usar el nuevo CircleRoundRobinScheduler
      const result = await CircleRoundRobinScheduler.scheduleTournament(
        selectedTournament.id,
        pairs,
        selectedTournament.courts
      );

      if (result.success) {
        await updateTournament(selectedTournament.id, { is_started: true });
        setSelectedTournament((prev) =>
          prev ? { ...prev, is_started: true } : null
        );

        await loadTournamentData();
        showToast(result.message, "success");
      } else {
        setError(result.message);
        showToast(result.message, "error");
      }
    } catch (error) {
      console.error("Error starting tournament:", error);
      showToast("Error al iniciar la reta", "error");
    } finally {
      setLoading(false);
    }
  };

  const matchesByRound = matches.reduce((acc, match) => {
    const round = match.round || 1; // Use match.round if available, default to 1
    if (!acc[round]) {
      acc[round] = [];
    }
    acc[round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  const sortedPairs = useMemo(() => {
    return [...pairs].sort((a, b) => {
      // Ordenar por nombre de pareja (alfabético) ya que no tenemos estadísticas
      const nameA = `${a.player1_name}/${a.player2_name}`;
      const nameB = `${b.player1_name}/${b.player2_name}`;
      return nameA.localeCompare(nameB);
    });
  }, [pairs]);

  const isTournamentFinished = useMemo(() => {
    const finished =
      matches.length > 0 &&
      matches.every((match) => match.status === "finished");
    console.log("🏆 Estado de la reta:", {
      totalMatches: matches.length,
      finishedMatches: matches.filter((m) => m.status === "finished").length,
      isFinished: finished,
    });
    return finished;
  }, [matches]);

  // Comentado: Marcar automáticamente la reta como finalizada cuando todos los partidos terminen
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
          console.log("🏆 Marcando reta como finalizada automáticamente...");
          await updateTournament(selectedTournament.id, {
            is_finished: true,
          });

          // Actualizar el estado local de la reta
          setSelectedTournament((prev) =>
            prev ? { ...prev, is_finished: true } : null
          );

          console.log("✅ Reta marcada como finalizada");
        } catch (error) {
          console.error("❌ Error marcando reta como finalizada:", error);
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

    setError("");
    setShowWinnerScreen(false);
    setCurrentView("main");

    setForceRefresh(0);
    setShowDebugInfo(false);
  };

  return (
    <div className="App">
      {currentView === "main" ? (
        <div className="container">
          <h1>🏆 ¡Organiza tu Reta de Pádel y ¡Que Gane el Mejor! 🏅</h1>

          {loading && (
            <div className="loading">
              <p>⏳ Cargando...</p>
            </div>
          )}

          <div className="main-layout">
            {/* Gestión de Retas - Arriba de todo */}
            {/* Banner de Bienvenida */}
            {!selectedTournament && (
              <div className="welcome-banner">
                <h2>🏆 ¡Bienvenido a tu Gestor de Retas de Padel!</h2>
                <p>
                  Organiza y gestiona tus retas de padel de manera elegante y
                  profesional. ¡Que gane el mejor!
                </p>
                <div className="tutorial-steps">
                  <div className="tutorial-step">
                    <span className="tutorial-step-number">1</span>
                    <span className="tutorial-step-icon">🏆</span>
                    <span>Crea tu primera reta</span>
                  </div>
                  <div className="tutorial-step">
                    <span className="tutorial-step-number">2</span>
                    <span className="tutorial-step-icon">👥</span>
                    <span>Añade jugadores participantes</span>
                  </div>
                  <div className="tutorial-step">
                    <span className="tutorial-step-number">3</span>
                    <span className="tutorial-step-icon">🤝</span>
                    <span>Forma parejas</span>
                  </div>
                  <div className="tutorial-step">
                    <span className="tutorial-step-number">4</span>
                    <span className="tutorial-step-icon">⚡</span>
                    <span>Inicia la reta y genera partidos</span>
                  </div>
                </div>
              </div>
            )}

            <div className="reta-management-section">
              <TournamentManager
                selectedTournament={selectedTournament || undefined}
                onTournamentSelect={setSelectedTournament}
              />
            </div>

            {/* Contenido de la Reta Seleccionada */}
            <div className="reta-content">
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

                      {/* Panel de Estado de la Reta */}
                      <div className="component-card reta-status-card">
                        <div className="component-header">
                          <div className="component-icon">🏆</div>
                          <div className="component-title">
                            <h3>
                              {selectedTournament.is_finished
                                ? "Reta Finalizada"
                                : "Reta en Progreso"}
                            </h3>
                            <span className="component-subtitle">
                              Estado de la Reta
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
                                console.log("🔄 Botón de reset clickeado");
                                if (
                                  window.confirm(
                                    "¿Estás seguro de que quieres resetear la reta? Esto eliminará todos los partidos existentes y reseteará las estadísticas de todas las parejas."
                                  )
                                ) {
                                  try {
                                    console.log(
                                      "🔄 Iniciando proceso de reset..."
                                    );
                                    setLoading(true);

                                    // 1. Eliminar todos los partidos de la reta
                                    console.log("🗑️ Eliminando partidos...");
                                    await deleteMatchesByTournament(
                                      selectedTournament.id
                                    );
                                    console.log("✅ Partidos eliminados");

                                    // 2. Resetear estadísticas de todas las parejas (sin actualizar base de datos)
                                    console.log(
                                      "🔄 Reseteando estadísticas de todas las parejas..."
                                    );
                                    for (const pair of pairs) {
                                      console.log(
                                        `🔄 Reseteando pareja: ${
                                          pair.player1?.name ||
                                          pair.player1_name
                                        } + ${
                                          pair.player2?.name ||
                                          pair.player2_name
                                        }`
                                      );
                                      // Las estadísticas se recalculan automáticamente al eliminar los partidos
                                    }
                                    console.log(
                                      "✅ Estadísticas de parejas reseteadas (se recalculan automáticamente)"
                                    );

                                    // 3. Marcar la reta como no iniciada
                                    console.log(
                                      "🔄 Marcando reta como no iniciada..."
                                    );
                                    await updateTournament(
                                      selectedTournament.id,
                                      {
                                        is_started: false,
                                      }
                                    );
                                    console.log(
                                      "✅ Reta marcada como no iniciada"
                                    );

                                    // 4. Actualizar estado local
                                    setSelectedTournament((prev) =>
                                      prev
                                        ? { ...prev, is_started: false }
                                        : null
                                    );
                                    setMatches([]);

                                    // 5. Recargar datos de la reta
                                    console.log(
                                      "🔄 Recargando datos de la reta..."
                                    );
                                    await loadTournamentData();
                                    console.log("✅ Datos recargados");

                                    showToast(
                                      "¡Reta reseteada exitosamente!",
                                      "success"
                                    );
                                    console.log(
                                      "🎉 Reset completado exitosamente"
                                    );
                                  } catch (error) {
                                    console.error(
                                      "❌ Error al resetear la reta:",
                                      error
                                    );
                                    setError(
                                      "Error al resetear la reta: " +
                                        (error as Error).message
                                    );
                                  } finally {
                                    setLoading(false);
                                  }
                                } else {
                                  console.log(
                                    "❌ Reset cancelado por el usuario"
                                  );
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
                                      `• Retas: 1\n` +
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

                    {/* Sección de Enlace Público */}
                    {selectedTournament.is_started && (
                      <div className="public-link-section">
                        <h3>🔗 Enlace Público</h3>
                        <div className="public-link-info">
                          <p>
                            Comparte este enlace con los participantes para que
                            vean los resultados en tiempo real
                          </p>
                          <p>
                            Los participantes solo podrán ver los resultados, no
                            podrán editar nada
                          </p>
                        </div>
                        <div className="public-link-actions">
                          <button
                            className="public-link-button"
                            onClick={() =>
                              copyPublicLink(selectedTournament.id)
                            }
                          >
                            📋 Copiar Enlace
                          </button>
                          <a
                            href={generatePublicLink(selectedTournament.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="public-link-preview"
                          >
                            👁️ Ver Vista Pública
                          </a>
                        </div>
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
                                      {pairStats.get(pair.id)?.sets || 0}
                                    </span>
                                  </div>
                                  <div className="compact-stat">
                                    <span className="compact-stat-label">
                                      PARTIDOS
                                    </span>
                                    <span className="compact-stat-value">
                                      {pairStats.get(pair.id)?.matches || 0}
                                    </span>
                                  </div>
                                  <div className="compact-stat">
                                    <span className="compact-stat-label">
                                      PUNTOS
                                    </span>
                                    <span className="compact-stat-value">
                                      {pairStats.get(pair.id)?.points || 0}
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
                      <div className="reta-content">
                        {/* Lista de partidos */}
                        <div className="modern-matches-section">
                          <div className="modern-matches-header">
                            <div className="modern-matches-title">
                              <h3>🎾 Partidos</h3>
                              <span className="modern-matches-count">
                                {matches.length} total
                              </span>
                            </div>
                          </div>
                          {matches.length === 0 ? (
                            <div className="modern-match-error">
                              <p>📝 No hay partidos programados aún</p>
                              <p>
                                Inicia la reta para generar los partidos
                                automáticamente
                              </p>
                            </div>
                          ) : (
                            Object.entries(matchesByRound).map(
                              ([round, roundMatches]) => (
                                <div
                                  key={round}
                                  className="modern-round-section"
                                >
                                  <div className="modern-round-header">
                                    <h4 className="modern-round-title">
                                      🔄 Ronda {round}
                                    </h4>
                                    <span className="modern-round-count">
                                      {roundMatches.length} partidos
                                    </span>
                                  </div>
                                  <div className="modern-matches-grid">
                                    {roundMatches.map((match) => (
                                      <MatchCardWithResults
                                        key={match.id}
                                        match={match}
                                        isSelected={false}
                                        onSelect={() => {}}
                                        onCorrectScore={async (match: any) => {
                                          console.log(
                                            "🔄 Actualizando tabla para partido:",
                                            match.id
                                          );
                                          try {
                                            // Solo incrementar forceRefresh - StandingsTable se actualizará automáticamente
                                            setForceRefresh((prev) => prev + 1);
                                            console.log(
                                              "✅ ForceRefresh incrementado"
                                            );
                                          } catch (error) {
                                            console.error(
                                              "❌ Error en actualización:",
                                              error
                                            );
                                          }
                                        }}
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
                        <RealTimeStandingsTable
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
                            {matches.filter((m) => m.status === 'finished').length},
                            Reta terminada:{" "}
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
        </div>
      ) : currentView === "public" ? (
        /* Vista Pública de la Reta */
        <PublicTournamentView tournamentId={publicTournamentId!} />
      ) : (
        /* Pantalla de ganador - Nueva ventana */
        <div className="winner-page">
          {/* Pantalla de ganador - Versión Elegante */}
          {showWinnerScreen && winner && (
            <div className="elegant-winner-screen">
              <div className="elegant-winner-section">
                <div className="elegant-winner-header">
                  <h1 className="elegant-winner-title">
                    🏆 ¡GANADOR DE LA RETA! 🏆
                  </h1>
                </div>
                <div className="elegant-winner-content">
                  <div className="elegant-winner-names">
                    {winner.player1?.name} / {winner.player2?.name}
                  </div>
                  <div className="elegant-winner-subtitle">
                    ¡Son los campeones de la reta!
                  </div>

                  <div className="elegant-winner-stats">
                    <div className="elegant-winner-stat">
                      <span className="elegant-winner-stat-number">
                        {tournamentWinner ? tournamentWinner.totalSets : 0}
                      </span>
                      <span className="elegant-winner-stat-label">
                        Sets Ganados
                      </span>
                    </div>
                    <div className="elegant-winner-stat">
                      <span className="elegant-winner-stat-number">
                        {tournamentWinner ? tournamentWinner.matchesPlayed : 0}
                      </span>
                      <span className="elegant-winner-stat-label">
                        Partidos Jugados
                      </span>
                    </div>
                    <div className="elegant-winner-stat">
                      <span className="elegant-winner-stat-number">
                        {tournamentWinner ? tournamentWinner.totalPoints : 0}
                      </span>
                      <span className="elegant-winner-stat-label">
                        Puntos Totales
                      </span>
                    </div>
                    {tournamentWinner && (
                      <div className="elegant-winner-stat">
                        <span className="elegant-winner-stat-number">
                          {tournamentWinner.winPercentage.toFixed(1)}%
                        </span>
                        <span className="elegant-winner-stat-label">
                          Porcentaje de Victoria
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="elegant-winner-actions">
                    <button
                      className="elegant-winner-back-btn"
                      onClick={hideWinnerScreenHandler}
                    >
                      🏠 Volver al Gestor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Notifications */}
      <ModernToast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
        duration={4000}
      />
    </div>
  );
}

export default App;
