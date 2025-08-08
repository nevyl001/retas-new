import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import { TournamentManager } from "./components/TournamentManager";
import { PlayerManager } from "./components/PlayerManager";
import { PairManager } from "./components/PairManager";
import { MatchScoreEditor } from "./components/MatchScoreEditor";
import StandingsTable from "./components/StandingsTable";
import { SuccessModal } from "./components/SuccessModal";

import {
  Tournament,
  Player,
  Pair,
  Match,
  Game,
  createPair,
  getPairs,
  updatePair,
  deletePair as deletePairFromDB,
  createMatch,
  getMatches,
  updateMatch,
  deleteMatchesByTournament,
  getGames,
  updateGame,
  deleteGame,
  updateTournament,
} from "./lib/database";
import { testConnection } from "./lib/supabaseClient";
import { FlexibleMatchFinisher } from "./components/FlexibleMatchFinisher";
import { MatchResultCalculator } from "./components/MatchResultCalculator";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "./components/TournamentWinnerCalculator";

function App() {
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [showPairManager, setShowPairManager] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);
  const [showMatchResults, setShowMatchResults] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] =
    useState<Match | null>(null);
  const [calculatedMatchResults, setCalculatedMatchResults] =
    useState<any>(null);
  const [showScoreCorrector, setShowScoreCorrector] = useState(false);
  const [selectedCorrectorMatch, setSelectedCorrectorMatch] =
    useState<Match | null>(null);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalData, setSuccessModalData] = useState({
    title: "",
    message: "",
    icon: "✅",
  });

  // Cargar datos cuando se selecciona un torneo
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
        "Error al cargar los datos del torneo: " + (err as Error).message
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
      setError("No hay torneo seleccionado");
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
          `La pareja ${player1.name} y ${player2.name} ya está registrada`
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
      setError("Se necesitan al menos 2 parejas para iniciar el torneo");
      return;
    }

    try {
      setLoading(true);
      setError("");

      console.log("🚀 Iniciando torneo:", selectedTournament.name);

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
        title: "¡Torneo Iniciado!",
        message: `Se han creado ${createdMatches.length} partidos exitosamente usando ${selectedTournament.courts} canchas. El torneo está listo para comenzar.`,
        icon: "🏆",
      });
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error starting tournament:", error);
      setError("Error al iniciar el torneo: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateTieBreakScore = async (
    gameId: string,
    pair1Points: number,
    pair2Points: number
  ) => {
    try {
      setError("");

      setGames((prevGames) =>
        prevGames.map((g) =>
          g.id === gameId
            ? {
                ...g,
                tie_break_pair1_points: pair1Points,
                tie_break_pair2_points: pair2Points,
              }
            : g
        )
      );

      await updateGame(gameId, {
        tie_break_pair1_points: pair1Points,
        tie_break_pair2_points: pair2Points,
      });
    } catch (err) {
      console.error("❌ Error al actualizar el tie break:", err);
      setError("Error al actualizar el tie break: " + (err as Error).message);
    }
  };

  const toggleTieBreak = async (gameId: string) => {
    try {
      setError("");
      const game = games.find((g) => g.id === gameId);
      if (!game) return;

      const newIsTieBreak = !game.is_tie_break;

      setGames((prevGames) =>
        prevGames.map((g) =>
          g.id === gameId
            ? {
                ...g,
                is_tie_break: newIsTieBreak,
                tie_break_pair1_points: 0,
                tie_break_pair2_points: 0,
              }
            : g
        )
      );

      await updateGame(gameId, {
        is_tie_break: newIsTieBreak,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      });
    } catch (err) {
      setError("Error al cambiar el tipo de juego");
      console.error(err);
    }
  };

  const removeGame = async (gameId: string) => {
    try {
      setError("");

      await deleteGame(gameId);
      setGames(games.filter((g) => g.id !== gameId));
    } catch (err) {
      console.error("❌ Error al eliminar el juego:", err);
      setError("Error al eliminar el juego: " + (err as Error).message);
    }
  };

  const correctGameScore = useCallback(
    async (
      gameId: string,
      pair1Games: number,
      pair2Games: number,
      pair1TieBreakPoints: number = 0,
      pair2TieBreakPoints: number = 0,
      isTieBreak: boolean = false
    ) => {
      try {
        setError("");

        setGames((prevGames) =>
          prevGames.map((g) =>
            g.id === gameId
              ? {
                  ...g,
                  pair1_games: pair1Games,
                  pair2_games: pair2Games,
                  tie_break_pair1_points: pair1TieBreakPoints,
                  tie_break_pair2_points: pair2TieBreakPoints,
                  is_tie_break: isTieBreak,
                  updated_at: new Date().toISOString(),
                }
              : g
          )
        );

        await updateGame(gameId, {
          pair1_games: pair1Games,
          pair2_games: pair2Games,
          tie_break_pair1_points: pair1TieBreakPoints,
          tie_break_pair2_points: pair2TieBreakPoints,
          is_tie_break: isTieBreak,
        });
      } catch (err) {
        console.error("❌ Error al corregir el marcador:", err);
        setError("Error al corregir el marcador: " + (err as Error).message);
      }
    },
    []
  );

  const finishMatch = async (matchId: string) => {
    try {
      setError("");
      const match = matches.find((m) => m.id === matchId);
      if (!match) {
        console.error("Match not found:", matchId);
        return;
      }

      const matchGames = games.filter((g) => g.match_id === matchId);

      if (!FlexibleMatchFinisher.canFinishMatch(matchGames)) {
        setError(
          "No se puede finalizar el partido. Verifica que todos los juegos tengan marcadores válidos."
        );
        return;
      }

      const result = await FlexibleMatchFinisher.finishMatch(
        match,
        matchGames,
        pairs,
        async () => {
          if (selectedTournament) {
            const pairsData = await getPairs(selectedTournament.id);
            setPairs(pairsData);
            setForceRefresh((prev) => prev + 1);
            const matchesData = await getMatches(selectedTournament.id);
            setMatches(matchesData);
          }
        }
      );

      if (result.success) {
        setMatches(
          matches.map((m) =>
            m.id === matchId
              ? { ...m, winner_id: result.winnerId, is_finished: true }
              : m
          )
        );

        if (selectedTournament) {
          const updatedPairsData = await getPairs(selectedTournament.id);
          setPairs(updatedPairsData);
          setForceRefresh((prev) => prev + 1);
        }

        alert(result.message);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("Error al finalizar el partido");
      console.error(err);
    }
  };

  const handleMatchSelect = (matchId: string) => {
    setSelectedMatchId(matchId);
    loadMatchGames(matchId);
  };

  const loadMatchGames = async (matchId: string) => {
    try {
      const gamesData = await getGames(matchId);
      setGames(gamesData);
    } catch (err) {
      console.error("❌ Error al cargar juegos:", err);
    }
  };

  const selectedMatch = matches.find((match) => match.id === selectedMatchId);

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
    return matches.length > 0 && matches.every((match) => match.is_finished);
  }, [matches]);

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
      console.log("🏆 Calculando ganador del torneo...");
      const winner = await TournamentWinnerCalculator.calculateTournamentWinner(
        pairs,
        matches
      );
      setTournamentWinner(winner);
      setShowWinnerScreen(true);
    } catch (error) {
      console.error("❌ Error al calcular ganador:", error);
      setShowWinnerScreen(true);
    }
  };

  const hideWinnerScreenHandler = () => {
    setShowWinnerScreen(false);
  };

  const showMatchResultsHandler = async (match: Match) => {
    try {
      // Obtener los juegos del partido
      const matchGames = await getGames(match.id);

      // Calcular estadísticas en tiempo real
      const stats = MatchResultCalculator.calculateMatchStatistics(
        match,
        matchGames
      );

      // Crear un objeto con los resultados calculados
      const calculatedMatch = {
        ...match,
        pair1: {
          ...match.pair1,
          games_won: stats.pair1GamesWon,
          sets_won: stats.pair1SetsWon,
          points: stats.pair1TotalPoints,
        },
        pair2: {
          ...match.pair2,
          games_won: stats.pair2GamesWon,
          sets_won: stats.pair2SetsWon,
          points: stats.pair2TotalPoints,
        },
        winner_id: stats.isTie
          ? undefined
          : stats.pair1TotalPoints > stats.pair2TotalPoints
          ? match.pair1_id
          : match.pair2_id,
      };

      setSelectedMatchResults(match);
      setCalculatedMatchResults(calculatedMatch);
      setShowMatchResults(true);
    } catch (error) {
      console.error("Error al calcular resultados:", error);
      // Fallback al comportamiento original
      setSelectedMatchResults(match);
      setShowMatchResults(true);
    }
  };

  const hideMatchResultsHandler = () => {
    setShowMatchResults(false);
    setSelectedMatchResults(null);
    setCalculatedMatchResults(null);
  };

  const handleViewTournamentResults = async (tournament: Tournament) => {
    try {
      setSelectedTournament(tournament);
      await loadTournamentData();
      alert(
        `✅ Torneo "${tournament.name}" seleccionado\n\nAhora puedes ver todos los partidos y resultados en el panel derecho.`
      );
    } catch (err) {
      console.error("❌ Error al cargar resultados del torneo:", err);
      alert("Error al cargar los resultados del torneo. Inténtalo de nuevo.");
    }
  };

  const recalculateMatchWinner = async (matchId: string) => {
    try {
      const match = matches.find((m) => m.id === matchId);
      if (!match) {
        console.error("Match not found:", matchId);
        return;
      }

      const matchGames = await getGames(matchId);

      if (matchGames.length === 0) {
        console.log("No hay juegos para recalcular");
        return;
      }

      let pair1Games = 0;
      let pair2Games = 0;

      matchGames.forEach((game) => {
        if (game.is_tie_break) {
          if (
            game.tie_break_pair1_points >= 10 &&
            game.tie_break_pair1_points - game.tie_break_pair2_points >= 2
          ) {
            pair1Games++;
          } else if (
            game.tie_break_pair2_points >= 10 &&
            game.tie_break_pair2_points - game.tie_break_pair1_points >= 2
          ) {
            pair2Games++;
          }
        } else {
          if (game.pair1_games > game.pair2_games) {
            pair1Games++;
          } else if (game.pair2_games > game.pair1_games) {
            pair2Games++;
          }
        }
      });

      const isTie = pair1Games === pair2Games;
      const winnerId = isTie
        ? undefined
        : pair1Games > pair2Games
        ? match.pair1_id
        : match.pair2_id;

      await updateMatch(matchId, {
        winner_id: winnerId,
        is_finished: true,
      });

      console.log("✅ Ganador recalculado y actualizado en la base de datos");
    } catch (error) {
      console.error("Error recalculating match winner:", error);
    }
  };

  const handleBackToHome = () => {
    setSelectedTournament(null);
    setPairs([]);
    setMatches([]);
    setGames([]);
    setSelectedMatchId(null);
    setError("");
    setShowWinnerScreen(false);
    setShowMatchResults(false);
    setSelectedMatchResults(null);
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

  const openScoreCorrector = async (match: Match) => {
    try {
      // Recargar los juegos del partido antes de abrir el editor
      const matchGames = await getGames(match.id);
      setGames((prevGames) => {
        const otherGames = prevGames.filter((g) => g.match_id !== match.id);
        return [...otherGames, ...matchGames];
      });
    } catch (error) {
      console.error("Error al cargar juegos:", error);
    }
    setSelectedCorrectorMatch(match);
    setShowScoreCorrector(true);
  };

  const closeScoreCorrector = () => {
    setShowScoreCorrector(false);
    setSelectedCorrectorMatch(null);
  };

  // Función para cuando se corrige un juego (NO incrementa forceRefresh)
  const handleGameCorrection = async () => {
    if (selectedTournament) {
      console.log(
        "🔄 Juego corregido - NO actualizando tabla de clasificación"
      );

      // NO incrementar forceRefresh cuando se corrige un juego
      // Solo cerrar el editor
      console.log("✅ Solo se corrigió el juego - NO se actualizó la tabla");
    }
    closeScoreCorrector();
  };

  // Función para cuando se finaliza un partido (SÍ incrementa forceRefresh)
  const handleScoreCorrectorUpdate = async () => {
    if (selectedTournament) {
      console.log(
        "🏆 Actualizando tabla de clasificación después de FINALIZAR partido..."
      );

      // SOLO incrementar forceRefresh cuando se FINALIZA un partido
      setForceRefresh((prev) => {
        console.log(
          `🏆 Incrementando forceRefresh de ${prev} a ${
            prev + 1
          } (FINALIZACIÓN)`
        );
        return prev + 1;
      });

      console.log(
        "✅ Tabla de clasificación actualizada después de finalizar partido"
      );
    }
    closeScoreCorrector();
  };

  return (
    <div className="App">
      <div className="container">
        <h1>🏆 Gestión de Torneos Express y Retas</h1>

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
          <div className="left-panel">
            <TournamentManager
              selectedTournament={selectedTournament || undefined}
              onTournamentSelect={setSelectedTournament}
              onViewResults={handleViewTournamentResults}
            />
          </div>

          <div className="right-panel">
            {selectedTournament ? (
              <>
                <div className="tournament-details">
                  {/* Gestión de Jugadores */}
                  <div className="player-management-section">
                    <div className="player-management-header">
                      <button
                        className="toggle-player-manager-btn"
                        onClick={() => setShowPlayerManager(!showPlayerManager)}
                      >
                        {showPlayerManager
                          ? "Ocultar Jugadores"
                          : "Gestionar Jugadores"}
                      </button>
                    </div>

                    {showPlayerManager && (
                      <div className="player-manager-container">
                        <PlayerManager
                          playersInPairs={pairs.flatMap((pair) => [
                            pair.player1_id,
                            pair.player2_id,
                          ])}
                          onPlayerSelect={(players) => {
                            console.log("=== SELECCIÓN DE JUGADORES ===");
                            console.log("Players selected:", players.length);
                            players.forEach((player, index) => {
                              console.log(
                                `Player ${index + 1}:`,
                                player.name,
                                "(ID:",
                                player.id + ")"
                              );
                            });

                            // Validación: Verificar si algún jugador ya está en una pareja
                            const playersInPairs = players.filter((player) => {
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
                                    existingPair?.player1?.id === player.id
                                      ? existingPair?.player2?.name
                                      : existingPair?.player1?.name
                                  }`
                                );
                              }

                              return isInPair;
                            });

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
                                  console.log("Existing pair:", existingPair);
                                }

                                return sameIds || sameNames;
                              });

                              if (existingPair) {
                                console.log(
                                  "🚨 ERROR: Pareja ya existe en la base de datos"
                                );
                                setError(
                                  `La pareja ${player1.name} + ${player2.name} ya existe en el torneo`
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

                  {/* Gestión de Parejas - NUEVO COMPONENTE */}
                  <div className="pair-management-section">
                    <div className="pair-management-header">
                      <button
                        className="toggle-pair-manager-btn"
                        onClick={() => setShowPairManager(!showPairManager)}
                      >
                        {showPairManager
                          ? "✏️ Ocultar Gestión de Parejas"
                          : "✏️ Mostrar Gestión de Parejas"}
                      </button>
                    </div>

                    {showPairManager && (
                      <div className="pair-manager-container">
                        <PairManager
                          pairs={pairs}
                          onPairUpdate={updatePairPlayers}
                          onPairDelete={deletePair}
                        />
                      </div>
                    )}
                  </div>

                  {!selectedTournament.is_started ? (
                    <div className="start-tournament-section">
                      <h3>🚀 Iniciar Torneo</h3>
                      <div className="tournament-info">
                        <p>Tienes {pairs.length} parejas registradas</p>
                        <p>
                          Se crearán {(pairs.length * (pairs.length - 1)) / 2}{" "}
                          partidos (round-robin completo - todas las parejas se
                          enfrentan)
                        </p>
                        <p>
                          Estado del torneo:{" "}
                          {selectedTournament.is_started
                            ? "Iniciado"
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
                          ? "🏆 Torneo Ya Iniciado"
                          : pairs.length < 2
                          ? "❌ Necesitas al menos 2 parejas"
                          : "🚀 ¡Iniciar Torneo!"}
                      </button>
                    </div>
                  ) : (
                    <div className="tournament-status-section">
                      <h3>🏆 Torneo en Progreso</h3>
                      <div className="tournament-info">
                        <p>El torneo ya está iniciado y en progreso</p>
                        <p>Tienes {pairs.length} parejas registradas</p>
                        <p>Estado del torneo: Iniciado</p>
                      </div>
                      <button
                        className="reset-button"
                        onClick={async () => {
                          if (
                            window.confirm(
                              "¿Estás seguro de que quieres resetear el torneo? Esto eliminará todos los partidos existentes."
                            )
                          ) {
                            try {
                              setLoading(true);
                              await deleteMatchesByTournament(
                                selectedTournament.id
                              );
                              await updateTournament(selectedTournament.id, {
                                is_started: false,
                              });
                              setSelectedTournament((prev) =>
                                prev ? { ...prev, is_started: false } : null
                              );
                              setMatches([]);
                              await loadTournamentData();
                              setSuccessModalData({
                                title: "¡Torneo Reseteado!",
                                message:
                                  "El torneo ha sido reseteado y está listo para iniciar nuevamente.",
                                icon: "🔄",
                              });
                              setShowSuccessModal(true);
                            } catch (error) {
                              setError(
                                "Error al resetear el torneo: " +
                                  (error as Error).message
                              );
                            } finally {
                              setLoading(false);
                            }
                          }
                        }}
                        disabled={loading}
                      >
                        {loading ? "⏳ Reseteando..." : "🔄 Resetear Torneo"}
                      </button>
                    </div>
                  )}

                  {/* Debug info - COLAPSIBLE */}
                  {selectedTournament && (
                    <div className="debug-section">
                      <button
                        className="debug-toggle-btn"
                        onClick={() => setShowDebugInfo(!showDebugInfo)}
                      >
                        {showDebugInfo ? "🔽" : "🔼"} Debug Info
                      </button>

                      {showDebugInfo && (
                        <div className="debug-info">
                          <div className="debug-header">
                            <h4>🔧 Información de Debug</h4>
                            <div className="debug-stats">
                              <span>
                                Estado:{" "}
                                {selectedTournament.is_started
                                  ? "✅ Iniciado"
                                  : "⏳ Pendiente"}
                              </span>
                              <span>Parejas: {pairs.length}</span>
                              <span>Partidos: {matches.length}</span>
                            </div>
                          </div>

                          <div className="debug-buttons">
                            <button
                              onClick={async () => {
                                console.log("=== PROBAR CONEXIÓN ===");
                                const isConnected = await testConnection();
                                if (isConnected) {
                                  setError("");
                                } else {
                                  setError(
                                    "❌ Error de conexión a Supabase. Verifica tu configuración."
                                  );
                                }
                              }}
                              className="debug-btn connection-btn"
                            >
                              🔌 Probar Conexión
                            </button>

                            <button
                              onClick={() => {
                                console.log(
                                  "=== FORZANDO RECARGA DE DATOS ==="
                                );
                                loadTournamentData();
                              }}
                              className="debug-btn reload-btn"
                            >
                              🔄 Recargar Datos
                            </button>

                            <button
                              onClick={async () => {
                                console.log(
                                  "=== VERIFICANDO ESTADO DEL TORNEO ==="
                                );
                                try {
                                  console.log(
                                    "Estado actual del torneo:",
                                    selectedTournament
                                  );
                                  console.log(
                                    "Parejas en estado:",
                                    pairs.length
                                  );
                                  console.log(
                                    "Partidos en estado:",
                                    matches.length
                                  );

                                  const dbPairs = await getPairs(
                                    selectedTournament.id
                                  );
                                  const dbMatches = await getMatches(
                                    selectedTournament.id
                                  );

                                  console.log("Parejas en BD:", dbPairs.length);
                                  console.log(
                                    "Partidos en BD:",
                                    dbMatches.length
                                  );

                                  alert(
                                    `Estado del torneo:\n\nParejas: ${
                                      pairs.length
                                    } (estado) / ${
                                      dbPairs.length
                                    } (BD)\nPartidos: ${
                                      matches.length
                                    } (estado) / ${
                                      dbMatches.length
                                    } (BD)\n\nTorneo iniciado: ${
                                      selectedTournament.is_started
                                        ? "Sí"
                                        : "No"
                                    }`
                                  );
                                } catch (error) {
                                  console.error(
                                    "Error verificando estado:",
                                    error
                                  );
                                }
                              }}
                              className="debug-btn status-btn"
                            >
                              🔍 Verificar Estado
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mostrar parejas creadas */}
                  {pairs.length > 0 && (
                    <div className="pairs-display">
                      <h3>👥 Parejas Registradas ({pairs.length})</h3>
                      <div className="pairs-grid">
                        {pairs.map((pair, index) => (
                          <div key={pair.id} className="pair-display-card">
                            <div className="pair-number">#{index + 1}</div>
                            <div className="pair-names">
                              {pair.player1?.name} y {pair.player2?.name}
                            </div>
                            <div className="pair-stats">
                              <span>Sets: {pair.sets_won}</span>
                              <span>Partidos: {pair.matches_played}</span>
                              <span>Puntos: {pair.points}</span>
                            </div>
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Estás seguro de que quieres eliminar la pareja "${pair.player1?.name} y ${pair.player2?.name}"?`
                                  )
                                ) {
                                  deletePair(pair.id);
                                }
                              }}
                              className="delete-pair-btn"
                              title="Eliminar pareja"
                            >
                              🗑️
                            </button>
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
                              Inicia el torneo para generar los partidos
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
                                    <div
                                      key={match.id}
                                      className={`match-card ${
                                        selectedMatchId === match.id
                                          ? "selected"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        handleMatchSelect(match.id)
                                      }
                                    >
                                      <div className="match-header">
                                        <h5>
                                          {match.pair1?.player1?.name} y{" "}
                                          {match.pair1?.player2?.name} vs{" "}
                                          {match.pair2?.player1?.name} y{" "}
                                          {match.pair2?.player2?.name}
                                        </h5>
                                        <div className="match-info">
                                          <span className="court-badge">
                                            🏟️ Cancha {match.court}
                                          </span>
                                          <span className="round-badge">
                                            🔄 Ronda {match.round}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="match-details">
                                        <p className="match-pairs">
                                          <strong>Pareja 1:</strong>{" "}
                                          {match.pair1?.player1?.name} y{" "}
                                          {match.pair1?.player2?.name}
                                        </p>
                                        <p className="match-pairs">
                                          <strong>Pareja 2:</strong>{" "}
                                          {match.pair2?.player1?.name} y{" "}
                                          {match.pair2?.player2?.name}
                                        </p>
                                      </div>
                                      {(() => {
                                        // Calcular el ganador en tiempo real
                                        const matchGames = games.filter(
                                          (g) => g.match_id === match.id
                                        );
                                        if (matchGames.length > 0) {
                                          const stats =
                                            MatchResultCalculator.calculateMatchStatistics(
                                              match,
                                              matchGames
                                            );
                                          const isTie = stats.isTie;

                                          if (isTie) {
                                            return (
                                              <div className="winner">
                                                <span className="winner-icon">
                                                  🤝
                                                </span>
                                                Empate ({stats.pair1TotalPoints}
                                                -{stats.pair2TotalPoints}{" "}
                                                puntos)
                                              </div>
                                            );
                                          } else {
                                            const winnerId =
                                              stats.pair1TotalPoints >
                                              stats.pair2TotalPoints
                                                ? match.pair1_id
                                                : match.pair2_id;

                                            return (
                                              <div className="winner">
                                                <span className="winner-icon">
                                                  🏆
                                                </span>
                                                Ganador:{" "}
                                                {winnerId === match.pair1_id
                                                  ? `${match.pair1?.player1?.name} y ${match.pair1?.player2?.name}`
                                                  : `${match.pair2?.player1?.name} y ${match.pair2?.player2?.name}`}
                                              </div>
                                            );
                                          }
                                        } else {
                                          // Fallback a los datos de la base de datos
                                          if (match.winner_id) {
                                            return (
                                              <div className="winner">
                                                <span className="winner-icon">
                                                  🏆
                                                </span>
                                                Ganador:{" "}
                                                {match.winner_id ===
                                                match.pair1_id
                                                  ? `${match.pair1?.player1?.name} y ${match.pair1?.player2?.name}`
                                                  : `${match.pair2?.player1?.name} y ${match.pair2?.player2?.name}`}
                                              </div>
                                            );
                                          } else if (match.is_finished) {
                                            return (
                                              <div className="winner">
                                                <span className="winner-icon">
                                                  🤝
                                                </span>
                                                Empate
                                              </div>
                                            );
                                          }
                                        }
                                        return null;
                                      })()}
                                      <div className="match-status">
                                        {match.is_finished ? (
                                          <span className="status-finished">
                                            ✔ Finalizado
                                          </span>
                                        ) : (
                                          <span className="status-pending">
                                            ⏳ Pendiente
                                          </span>
                                        )}
                                      </div>
                                      <div className="match-actions">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            showMatchResultsHandler(match);
                                          }}
                                          className="view-results-btn"
                                        >
                                          📊 Ver Resultados
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openScoreCorrector(match);
                                          }}
                                          className="correct-result-btn"
                                        >
                                          ✏️ Marcador
                                        </button>
                                      </div>
                                    </div>
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
                      {isTournamentFinished && winner && (
                        <div className="winner-button-container">
                          <button
                            className="show-winner-button"
                            onClick={showWinnerScreenHandler}
                          >
                            🏆 ¡Ver Ganador!
                          </button>
                        </div>
                      )}

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
                <h2>🏆 Bienvenido al Gestor de Torneos</h2>
                <p>
                  Selecciona un torneo del panel para comenzar a gestionar
                  partidos y resultados.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pantalla de ganador */}
        {showWinnerScreen && winner && (
          <div className="winner-screen">
            <div className="winner-content">
              <div className="winner-celebration">
                <h1 className="winner-title">🏆 ¡FELICIDADES! 🏆</h1>
                <div className="winner-names">
                  {winner.player1?.name} y {winner.player2?.name}
                </div>
                <div className="winner-subtitle">
                  ¡Son los campeones del torneo!
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
                  🏠 Volver al Torneo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de resultados de partido */}
        {showMatchResults && selectedMatchResults && (
          <div className="match-results-modal">
            <div className="match-results-content">
              <div className="match-results-header">
                <h3>📊 Resultados del Partido</h3>
                <button onClick={hideMatchResultsHandler} className="close-btn">
                  ✕
                </button>
              </div>

              <div className="match-results-info">
                <h4>
                  Partido {selectedMatchResults.court} - Ronda{" "}
                  {selectedMatchResults.round}
                </h4>
                <div className="pairs-info">
                  <div className="pair-info">
                    <strong>Pareja 1:</strong>{" "}
                    {selectedMatchResults.pair1?.player1?.name} y{" "}
                    {selectedMatchResults.pair1?.player2?.name}
                  </div>
                  <div className="pair-info">
                    <strong>Pareja 2:</strong>{" "}
                    {selectedMatchResults.pair2?.player1?.name} y{" "}
                    {selectedMatchResults.pair2?.player2?.name}
                  </div>
                </div>
              </div>

              <div className="match-results-details">
                <div className="result-summary">
                  <div className="result-item">
                    <span className="result-label">Juegos Ganados:</span>
                    <span className="result-value">
                      {calculatedMatchResults?.pair1?.games_won ||
                        selectedMatchResults.pair1?.games_won ||
                        0}{" "}
                      -{" "}
                      {calculatedMatchResults?.pair2?.games_won ||
                        selectedMatchResults.pair2?.games_won ||
                        0}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Sets Ganados:</span>
                    <span className="result-value">
                      {calculatedMatchResults?.pair1?.sets_won ||
                        selectedMatchResults.pair1?.sets_won ||
                        0}{" "}
                      -{" "}
                      {calculatedMatchResults?.pair2?.sets_won ||
                        selectedMatchResults.pair2?.sets_won ||
                        0}
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Puntos Totales:</span>
                    <span className="result-value">
                      {calculatedMatchResults?.pair1?.points ||
                        selectedMatchResults.pair1?.points ||
                        0}{" "}
                      -{" "}
                      {calculatedMatchResults?.pair2?.points ||
                        selectedMatchResults.pair2?.points ||
                        0}
                    </span>
                  </div>
                </div>

                <div className="match-winner">
                  {(() => {
                    // Verificar si es empate basado en los puntos totales
                    const pair1Points =
                      calculatedMatchResults?.pair1?.points ||
                      selectedMatchResults.pair1?.points ||
                      0;
                    const pair2Points =
                      calculatedMatchResults?.pair2?.points ||
                      selectedMatchResults.pair2?.points ||
                      0;
                    const isTie = pair1Points === pair2Points;

                    if (isTie) {
                      return (
                        <div className="tie-display">
                          <span className="tie-icon">🤝</span>
                          <span className="tie-text">
                            Empate ({pair1Points}-{pair2Points} puntos totales)
                          </span>
                        </div>
                      );
                    } else {
                      const winnerId =
                        calculatedMatchResults?.winner_id ||
                        selectedMatchResults.winner_id;
                      if (winnerId) {
                        return (
                          <div className="winner-display">
                            <span className="winner-icon">🏆</span>
                            <span className="winner-text">
                              Ganador:{" "}
                              {winnerId === selectedMatchResults.pair1?.id
                                ? `${selectedMatchResults.pair1?.player1?.name} y ${selectedMatchResults.pair1?.player2?.name}`
                                : `${selectedMatchResults.pair2?.player1?.name} y ${selectedMatchResults.pair2?.player2?.name}`}
                            </span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="tie-display">
                            <span className="tie-icon">🤝</span>
                            <span className="tie-text">Empate</span>
                          </div>
                        );
                      }
                    }
                  })()}
                </div>
              </div>

              <div className="match-results-actions">
                <button
                  onClick={hideMatchResultsHandler}
                  className="close-results-btn"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

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
    </div>
  );
}

export default App;
