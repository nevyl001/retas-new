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
import { AuthCallback } from "./components/auth/AuthCallback";
import { AdminProvider, useAdmin } from "./contexts/AdminContext";
import { AdminLogin } from "./components/admin/AdminLogin";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { AdminRoute } from "./components/admin/AdminRoute";
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
  const { isAdminLoggedIn } = useAdmin();

  // Estados básicos
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);

  // Inicializar currentView basado en la URL actual (solo una vez)
  const [currentView, setCurrentView] = useState<
    | "main"
    | "winner"
    | "public"
    | "auth-callback"
    | "admin-login"
    | "admin-dashboard"
  >(() => {
    const currentPath = window.location.pathname;
    console.log("🔍 Inicializando currentView basado en path:", currentPath);

    if (currentPath === "/auth/callback") return "auth-callback";
    if (currentPath === "/admin-login") return "admin-login";
    if (currentPath === "/admin-dashboard") return "admin-dashboard";
    if (currentPath.startsWith("/public/")) return "public";
    return "main";
  });

  // Log solo cuando cambien los valores (no en cada render)
  useEffect(() => {
    console.log("🔍 AppContent - isAdminLoggedIn:", isAdminLoggedIn);
    console.log("🔍 AppContent - currentView:", currentView);
  }, [isAdminLoggedIn, currentView]);

  // Efecto para detectar cuando el admin se loguea
  useEffect(() => {
    console.log(
      "🔍 useEffect admin login - isAdminLoggedIn:",
      isAdminLoggedIn,
      "currentView:",
      currentView
    );

    if (isAdminLoggedIn && currentView !== "admin-dashboard") {
      console.log("🔄 Admin logueado detectado, cambiando a admin-dashboard");
      setCurrentView("admin-dashboard");
    }
  }, [isAdminLoggedIn, currentView]);

  // Efecto para detectar cuando el admin se desloguea
  useEffect(() => {
    if (
      !isAdminLoggedIn &&
      (currentView === "admin-dashboard" || currentView === "admin-login")
    ) {
      console.log("🔄 Admin deslogueado detectado, cambiando a admin-login");
      setCurrentView("admin-login");
    }
  }, [isAdminLoggedIn, currentView]);

  const [publicTournamentId, setPublicTournamentId] = useState<string | null>(
    null
  );
  const [forceRefresh, setForceRefresh] = useState(0);
  const [, setError] = useState<string>("");

  // Detectar cambios en la URL (solo para rutas específicas)
  useEffect(() => {
    const checkCurrentPath = () => {
      const currentPath = window.location.pathname;
      console.log("🔍 Current path:", currentPath);

      // Solo cambiar currentView para rutas específicas, NO sobrescribir
      if (currentPath === "/auth/callback") {
        setCurrentView("auth-callback");
      } else if (currentPath === "/admin-login") {
        setCurrentView("admin-login");
      } else if (currentPath === "/admin-dashboard") {
        setCurrentView("admin-dashboard");
      } else if (currentPath.startsWith("/public/")) {
        setCurrentView("public");
        setPublicTournamentId(currentPath.split("/public/")[1]);
      }
      // NO cambiar a "main" automáticamente - dejar que se mantenga el valor inicial
    };

    // Escuchar cambios en la URL
    const handlePopState = () => {
      checkCurrentPath();
    };

    window.addEventListener("popstate", handlePopState);

    // También escuchar cambios programáticos en la URL
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(window.history, args);
      setTimeout(checkCurrentPath, 0);
    };

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(window.history, args);
      setTimeout(checkCurrentPath, 0);
    };

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

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
    winningTeamName,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournament]); // loadTournamentData es estable, no necesita estar en deps

  // Recargar datos automáticamente con debounce para evitar múltiples recargas
  useEffect(() => {
    if (selectedTournament && forceRefresh > 0) {
      // Debounce: esperar 300ms antes de recargar para agrupar múltiples actualizaciones
      const timeoutId = setTimeout(() => {
        console.log("🔄 Recargando datos debido a forceRefresh:", forceRefresh);
        loadTournamentData(selectedTournament);
      }, 300);

      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceRefresh, selectedTournament]); // loadTournamentData es estable

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
  const handleStartTournament = (opts: {
    format: "roundRobin" | "teams";
    teamsCount?: number;
    teamNames?: string[];
    pairToTeam?: Record<string, number>;
  }) => {
    return startTournament(selectedTournament!, pairs, user?.id || "", opts);
  };
  const handleReset = () => resetTournament(selectedTournament!, pairs);
  const handleShowWinner = () =>
    calculateAndShowWinner(pairs, matches, setCurrentView, {
      tournament: selectedTournament ?? undefined,
    });
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
    <div className="App">
      <ProtectedRoute>
        {/* Solo mostrar UserHeader cuando NO estemos en vista pública NI en admin */}
        {currentView !== "public" &&
          currentView !== "admin-login" &&
          currentView !== "admin-dashboard" && <UserHeader />}

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

        {currentView === "auth-callback" && (
          <AuthCallback onSuccess={() => setCurrentView("main")} />
        )}

        {currentView === "winner" && (
          <WinnerScreen
            isVisible={showWinnerScreen}
            winner={winner}
            tournamentWinner={tournamentWinner}
            winningTeamName={winningTeamName}
            onBackToManager={handleHideWinner}
          />
        )}

        {/* Rutas de Admin */}
        {currentView === "admin-login" && (
          <>
            {console.log("🔍 Renderizando AdminLogin")}
            <AdminLogin
              onLoginSuccess={() => {
                console.log(
                  "🔄 onLoginSuccess llamado - Redirigiendo a admin dashboard..."
                );
                setCurrentView("admin-dashboard");
              }}
            />
          </>
        )}
        {currentView === "admin-dashboard" && (
          <AdminRoute
            onUnauthorized={() => {
              console.log("🔄 Admin no autorizado, cambiando a admin-login");
              setCurrentView("admin-login");
            }}
          >
            <AdminDashboard />
          </AdminRoute>
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
  );
}

function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <AdminProvider>
          <AppContent />
        </AdminProvider>
      </UserProvider>
    </ThemeProvider>
  );
}

export default App;
