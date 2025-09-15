import React, { useState, useEffect, useMemo } from "react";
import "./App.css";
import "./styles/theme.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UserProvider, useUser } from "./contexts/UserContext";

// Components
import MainLayout from "./components/MainLayout";
import WinnerScreen from "./components/WinnerScreen";
import PublicTournamentView from "./components/PublicTournamentView";
import { ModernToast } from "./components/ModernToast";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { UserHeader } from "./components/UserHeader";
import { testConnection } from "./lib/supabaseClient";

// Types
import { Tournament, Player } from "./lib/database";

// Custom Hooks
import { useTournamentData } from "./hooks/useTournamentData";
import { usePairManagement } from "./hooks/usePairManagement";
import { useTournamentActions } from "./hooks/useTournamentActions";
import { useToastNotifications } from "./hooks/useToastNotifications";
import { useWinnerCalculation } from "./hooks/useWinnerCalculation";

function AppContent() {
  const { user } = useUser();

  // Estados básicos
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);
  const [currentView, setCurrentView] = useState<"main" | "winner" | "public">(
    "main"
  );
  const [publicTournamentId, setPublicTournamentId] = useState<string | null>(
    null
  );
  const [forceRefresh, setForceRefresh] = useState(0);
  const [, setError] = useState<string>("");

  // Estados de UI
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [showPairManager, setShowPairManager] = useState(false);
  const [showTournamentStatus, setShowTournamentStatus] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);

  // Custom hooks
  const { toast, showToast, hideToast } = useToastNotifications();
  const {
    pairs,
    setPairs,
    matches,
    setMatches,
    pairStats,
    loading,
    loadTournamentData,
  } = useTournamentData();
  const {
    tournamentWinner,
    showWinnerScreen,
    calculateAndShowWinner,
    hideWinnerScreen,
  } = useWinnerCalculation();

  // Pair management
  const { deletePair, updatePairPlayers, addPair } = usePairManagement(
    pairs,
    setPairs,
    selectedTournament,
    setSelectedPlayers,
    setError,
    showToast,
    user?.id
  );

  // Tournament actions
  const {
    startTournament,
    resetTournament,
    loading: actionLoading,
  } = useTournamentActions(
    setSelectedTournament,
    setMatches,
    () => selectedTournament && loadTournamentData(selectedTournament),
    showToast,
    setError
  );

  // Detectar vista pública
  useEffect(() => {
    const path = window.location.pathname;
    const publicMatch = path.match(/^\/public\/([a-f0-9-]+)$/);

    if (publicMatch) {
      const tournamentId = publicMatch[1];
      setPublicTournamentId(tournamentId);
      setCurrentView("public");
    }
  }, []);

  // Probar conexión a Supabase (solo una vez)
  useEffect(() => {
    const testOnce = async () => {
      await testConnection();
    };
    testOnce();
  }, []);

  // Cargar datos cuando se selecciona torneo
  useEffect(() => {
    if (selectedTournament) {
      loadTournamentData(selectedTournament);
    }
  }, [selectedTournament?.id, loadTournamentData]);

  // Recargar datos automáticamente
  useEffect(() => {
    if (selectedTournament && forceRefresh > 0) {
      console.log("🔄 Recargando datos debido a forceRefresh:", forceRefresh);
      loadTournamentData(selectedTournament);
    }
  }, [forceRefresh, selectedTournament, loadTournamentData]);

  // Utilidades
  const generatePublicLink = (tournamentId: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/public/${tournamentId}`;
  };

  const copyPublicLink = async (tournamentId: string) => {
    try {
      const publicLink = generatePublicLink(tournamentId);
      await navigator.clipboard.writeText(publicLink);
      showToast("¡Enlace público copiado al portapapeles!", "success");
    } catch (err) {
      showToast("Error al copiar el enlace", "error");
    }
  };

  // Handlers
  const handleStartTournament = () =>
    startTournament(selectedTournament!, pairs, user?.id || "");
  const handleReset = () => resetTournament(selectedTournament!, pairs);
  const handleShowWinner = () =>
    calculateAndShowWinner(pairs, matches, setCurrentView);
  const handleHideWinner = () => hideWinnerScreen(setCurrentView);

  const handleBackToHome = () => {
    setSelectedTournament(null);
    setPairs([]);
    setMatches([]);
    setError("");
    setCurrentView("main");
    setForceRefresh(0);
    setShowDebugInfo(false);
  };

  // Computed values
  const matchesByRound = matches.reduce((acc, match) => {
    const round = match.round || 1;
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {} as Record<number, any[]>);

  const sortedPairs = useMemo(() => {
    return [...pairs].sort((a, b) => {
      const nameA = `${a.player1_name}/${a.player2_name}`;
      const nameB = `${b.player1_name}/${b.player2_name}`;
      return nameA.localeCompare(nameB);
    });
  }, [pairs]);

  const isTournamentFinished = useMemo(() => {
    return (
      matches.length > 0 &&
      matches.every((match) => match.status === "finished")
    );
  }, [matches]);

  const winner = useMemo(() => {
    return (
      tournamentWinner?.pair || (sortedPairs.length > 0 ? sortedPairs[0] : null)
    );
  }, [tournamentWinner, sortedPairs]);

  return (
    <ThemeProvider>
      <UserProvider>
        <div className="App">
          <ProtectedRoute>
            {/* Solo mostrar UserHeader cuando NO estemos en vista pública */}
            {currentView !== "public" && <UserHeader />}

            {currentView === "main" && (
              <MainLayout
                selectedTournament={selectedTournament}
                onTournamentSelect={setSelectedTournament}
                loading={loading || actionLoading}
                userId={user?.id}
                pairs={pairs}
                matches={matches}
                pairStats={pairStats}
                matchesByRound={matchesByRound}
                showPlayerManager={showPlayerManager}
                setShowPlayerManager={setShowPlayerManager}
                showPairManager={showPairManager}
                setShowPairManager={setShowPairManager}
                showTournamentStatus={showTournamentStatus}
                setShowTournamentStatus={setShowTournamentStatus}
                showDebugInfo={showDebugInfo}
                setShowDebugInfo={setShowDebugInfo}
                selectedPlayers={selectedPlayers}
                setSelectedPlayers={setSelectedPlayers}
                setError={setError}
                addPair={addPair}
                updatePairPlayers={updatePairPlayers}
                deletePair={deletePair}
                onReset={handleReset}
                loadTournamentData={() =>
                  selectedTournament && loadTournamentData(selectedTournament)
                }
                setForceRefresh={setForceRefresh}
                forceRefresh={forceRefresh}
                onStartTournament={handleStartTournament}
                onCopyPublicLink={copyPublicLink}
                generatePublicLink={generatePublicLink}
                isTournamentFinished={isTournamentFinished}
                winner={winner}
                tournamentWinner={tournamentWinner}
                onShowWinnerScreen={handleShowWinner}
                onBackToHome={handleBackToHome}
              />
            )}

            {currentView === "public" && (
              <PublicTournamentView tournamentId={publicTournamentId!} />
            )}

            {currentView === "winner" && (
              <WinnerScreen
                isVisible={showWinnerScreen}
                winner={winner}
                tournamentWinner={tournamentWinner}
                onBackToManager={handleHideWinner}
              />
            )}
          </ProtectedRoute>

          <ModernToast
            message={toast.message}
            type={toast.type}
            isVisible={toast.isVisible}
            onClose={hideToast}
            duration={4000}
          />
        </div>
      </UserProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </ThemeProvider>
  );
}

export default App;
