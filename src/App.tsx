import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  lazy,
} from "react";
import "./App.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UserProvider, useUser } from "./contexts/UserContext";
import { AccountFeaturesProvider } from "./contexts/AccountFeaturesContext";
import { ClubExperienceProvider } from "./club-experience";

// Components
import MainLayout from "./components/MainLayout";
import WinnerScreen from "./components/WinnerScreen";
import { ModernToast } from "./components/ModernToast";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { UserHeader } from "./components/UserHeader";
import { AuthCallback } from "./components/auth/AuthCallback";
import { ResetPasswordPage } from "./components/auth/ResetPasswordPage";
import { AdminProvider, useAdmin } from "./contexts/AdminContext";
import { AdminRoute } from "./components/admin/AdminRoute";
import { parseAdminUserIdFromPath } from "./lib/admin/adminNav";
import { testConnection } from "./lib/supabaseClient";
import {
  AMERICANO_SESSION_TOURNAMENT_KEY,
  readAmericanoActiveTournamentId,
  readAmericanoTournamentIdFromSession,
} from "./lib/americanoDinamicoStorage";
import { isTorneoExpressPublicPath } from "./components/torneo-express/TorneoExpressRouter";
import { isLigaPublicPath } from "./components/liga/LigaRouter";
import { isDuelo2v2PublicPath } from "./components/duelo-2v2/Duelo2v2Router";
import { isJugadoresPublicPath } from "./components/jugadores/JugadoresRouter";
import { LoadingFallback } from "./components/LoadingFallback";
import { PrivacidadTerminosPage } from "./components/legal/PrivacidadTerminosPage";
import { useSyncPathname } from "./components/torneo-express/torneoExpressNav";
import {
  navigateToAppHome,
  navigateToReta,
  normalizeAppPathname,
  parseRetaIdFromPath,
  resolveAppViewFromPath,
  type AppView,
} from "./lib/appRouting";
import {
  continueTournament,
  getRouteForTournament,
} from "./lib/tournamentRouting";

// Types
import { Tournament, Player, getTournamentById, upsertTournamentPublicConfig } from "./lib/database";
import { isRoundRobinTournamentComplete } from "./lib/roundRobinChampionship";
import { readPersistedTournamentMode } from "./lib/gameModeMapping";
import { loadTeamConfigForTournament, resolveEffectiveTeamConfig } from "./lib/teamConfigDisplay";

// Custom Hooks
import { useTournamentData } from "./hooks/useTournamentData";
import { usePairManagement } from "./hooks/usePairManagement";
import { useTournamentActions } from "./hooks/useTournamentActions";
import { useToastNotifications } from "./hooks/useToastNotifications";
import { useWinnerCalculation } from "./hooks/useWinnerCalculation";
import { ErrorBoundary } from "./components/ErrorBoundary";

const TorneoExpressRouter = lazy(() =>
  import("./components/torneo-express/TorneoExpressRouter").then((module) => ({
    default: module.TorneoExpressRouter,
  }))
);
const LigaRouter = lazy(() =>
  import("./components/liga/LigaRouter").then((module) => ({
    default: module.LigaRouter,
  }))
);
const Duelo2v2Router = lazy(() =>
  import("./components/duelo-2v2/Duelo2v2Router").then((module) => ({
    default: module.Duelo2v2Router,
  }))
);
const PublicPantallaRouter = lazy(() =>
  import("./components/public/PublicPantallaRouter").then((module) => ({
    default: module.PublicPantallaRouter,
  }))
);
const JugadoresRouter = lazy(() =>
  import("./components/jugadores/JugadoresRouter").then((module) => ({
    default: module.JugadoresRouter,
  }))
);
const AmericanoDinamicoScreen = lazy(() =>
  import("./components/AmericanoDinamico/AmericanoDinamicoScreen").then(
    (module) => ({
      default: module.AmericanoDinamicoScreen,
    })
  )
);
const AdminLogin = lazy(() =>
  import("./components/admin/AdminLogin").then((module) => ({
    default: module.AdminLogin,
  }))
);
const AdminDashboard = lazy(() =>
  import("./components/admin/AdminDashboard").then((module) => ({
    default: module.AdminDashboard,
  }))
);
const AdminUserManagePage = lazy(() =>
  import("./components/admin/AdminUserManagePage").then((module) => ({
    default: module.AdminUserManagePage,
  }))
);
const PublicTournamentView = lazy(
  () => import("./components/PublicTournamentView")
);
const PublicAmericanoView = lazy(
  () => import("./components/PublicAmericanoView")
);
const PublicAmericanoResultsBoard = lazy(
  () => import("./components/PublicAmericanoResultsBoard")
);

function parsePublicAmericanoTournamentId(pathname: string): string | null {
  const m = pathname.match(/^\/public\/americano\/([^/?#]+)/i);
  const raw = m?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

function parsePublicAmericanoBoardTournamentId(pathname: string): string | null {
  const m = pathname.match(/^\/public\/americano-pantalla\/([^/?#]+)/i);
  const raw = m?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

function AppContent() {
  const { user, loading: authLoading } = useUser();
  const { isAdminLoggedIn } = useAdmin();
  const appPathname = useSyncPathname();

  // Estados básicos
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);

  // Inicializar currentView basado en la URL actual (solo una vez)
  const [currentView, setCurrentView] = useState<AppView>(() => {
    const currentPath = normalizeAppPathname(window.location.pathname);
    const view = resolveAppViewFromPath(currentPath);
    console.log("🔍 Inicializando currentView basado en path:", currentPath, "→", view);
    return view;
  });

  const [restoringRetaFromUrl, setRestoringRetaFromUrl] = useState(() =>
    Boolean(parseRetaIdFromPath(window.location.pathname))
  );

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

    if (isAdminLoggedIn && currentView === "admin-login") {
      console.log("🔄 Admin logueado detectado, cambiando a admin-dashboard");
      window.history.replaceState({}, "", "/admin-dashboard");
      setCurrentView("admin-dashboard");
    }
  }, [isAdminLoggedIn, currentView]);

  // Efecto para detectar cuando el admin se desloguea
  useEffect(() => {
    if (
      !isAdminLoggedIn &&
      (currentView === "admin-dashboard" ||
        currentView === "admin-user" ||
        currentView === "admin-login")
    ) {
      console.log("🔄 Admin deslogueado detectado, cambiando a admin-login");
      if (currentView === "admin-dashboard" || currentView === "admin-user") {
        window.history.replaceState({}, "", "/admin-login");
      }
      setCurrentView("admin-login");
    }
  }, [isAdminLoggedIn, currentView]);

  // Inicializar ID de vista pública desde la URL para no hacer peticiones con null
  const [publicTournamentId, setPublicTournamentId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      const path = window.location.pathname;
      const norm = normalizeAppPathname(path);
      if (/^\/public\/americano-pantalla\//i.test(norm)) return null;
      if (/^\/public\/americano\//i.test(norm)) return null;
      if (/^\/public\/liga\//i.test(norm)) return null;
      const m = path.match(/^\/public\/([^/?#]+)/);
      const seg = m?.[1];
      if (!seg || seg === "americano" || seg === "americano-pantalla") return null;
      return seg;
    }
  );
  const [publicAmericanoTournamentId, setPublicAmericanoTournamentId] =
    useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      return parsePublicAmericanoTournamentId(
        normalizeAppPathname(window.location.pathname)
      );
    });
  const [publicAmericanoBoardTournamentId, setPublicAmericanoBoardTournamentId] =
    useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      return parsePublicAmericanoBoardTournamentId(
        normalizeAppPathname(window.location.pathname)
      );
    });
  const [forceRefresh, setForceRefresh] = useState(0);
  const [error, setError] = useState<string>("");
  const isAmericanoRoute =
    normalizeAppPathname(window.location.pathname) === "/americano-dinamico";
  const americanoSearchParams = new URLSearchParams(window.location.search);
  const americanoTournamentIdFromUrl = americanoSearchParams.get("tournamentId");
  const americanoUserId = americanoSearchParams.get("userId");
  const pathLooksAmericano =
    normalizeAppPathname(window.location.pathname) === "/americano-dinamico";
  const americanoTournamentIdFromSession =
    currentView === "americano-dinamico" || pathLooksAmericano
      ? readAmericanoTournamentIdFromSession()
      : null;
  const americanoTournamentIdFromStorage =
    currentView === "americano-dinamico" || pathLooksAmericano
      ? readAmericanoActiveTournamentId()
      : null;
  /** URL > localStorage/session > reta seleccionada en memoria. */
  const americanoTournamentId =
    currentView === "americano-dinamico"
      ? americanoTournamentIdFromUrl ??
        americanoTournamentIdFromSession ??
        americanoTournamentIdFromStorage ??
        selectedTournament?.id ??
        null
      : americanoTournamentIdFromUrl;

  useEffect(() => {
    if (!americanoTournamentId || currentView !== "americano-dinamico") return;
    try {
      sessionStorage.setItem(
        AMERICANO_SESSION_TOURNAMENT_KEY,
        americanoTournamentId
      );
    } catch {
      /* ignore */
    }
  }, [americanoTournamentId, currentView]);

  /** Si la URL perdió ?tournamentId= (p. ej. navegación manual), reescribirla para que F5 siga funcionando. */
  useEffect(() => {
    if (currentView !== "americano-dinamico" || !americanoTournamentId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tournamentId") === americanoTournamentId) return;
    params.set("tournamentId", americanoTournamentId);
    const uid = americanoUserId || user?.id;
    if (uid) params.set("userId", uid);
    const q = params.toString();
    window.history.replaceState(
      {},
      "",
      `/americano-dinamico${q ? `?${q}` : ""}`
    );
  }, [currentView, americanoTournamentId, americanoUserId, user?.id]);

  const retaIdFromPath = useMemo(
    () => parseRetaIdFromPath(appPathname),
    [appPathname]
  );

  // Detectar cambios en la URL (solo para rutas específicas)
  useEffect(() => {
    const checkCurrentPath = () => {
      const currentPath = normalizeAppPathname(window.location.pathname);
      const nextView = resolveAppViewFromPath(currentPath);

      setCurrentView((prev) => (prev === nextView ? prev : nextView));

      if (parseRetaIdFromPath(currentPath)) {
        setRestoringRetaFromUrl(true);
      } else if (currentPath === "/") {
        setSelectedTournament(null);
        setRestoringRetaFromUrl(false);
      }

      if (/^\/public\/americano-pantalla\//i.test(currentPath)) {
        setPublicAmericanoBoardTournamentId(
          parsePublicAmericanoBoardTournamentId(currentPath)
        );
        setPublicTournamentId(null);
        setPublicAmericanoTournamentId(null);
      } else if (/^\/public\/americano\//i.test(currentPath)) {
        setPublicAmericanoTournamentId(
          parsePublicAmericanoTournamentId(currentPath)
        );
        setPublicAmericanoBoardTournamentId(null);
        setPublicTournamentId(null);
      } else if (/^\/public\/liga\//i.test(currentPath)) {
        setPublicTournamentId(null);
        setPublicAmericanoTournamentId(null);
        setPublicAmericanoBoardTournamentId(null);
      } else if (/^\/public\/duelo-2v2\//i.test(currentPath)) {
        setPublicTournamentId(null);
        setPublicAmericanoTournamentId(null);
        setPublicAmericanoBoardTournamentId(null);
      } else if (/^\/public\/pantalla\//i.test(currentPath)) {
        setPublicTournamentId(null);
        setPublicAmericanoTournamentId(null);
        setPublicAmericanoBoardTournamentId(null);
      } else if (currentPath.startsWith("/public/")) {
        const m = currentPath.match(/^\/public\/([^/?#]+)/);
        const seg = m?.[1];
        setPublicTournamentId(
          seg &&
            seg !== "americano" &&
            seg !== "americano-pantalla" &&
            seg !== "liga" &&
            seg !== "duelo-2v2" &&
            seg !== "pantalla"
            ? seg
            : null
        );
        setPublicAmericanoTournamentId(null);
        setPublicAmericanoBoardTournamentId(null);
      }
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
    championshipRevision,
    loadError,
  } = useTournamentData();

  const handleTournamentSelect = useCallback(
    (tournament: Tournament | null) => {
      if (!tournament) {
        setSelectedTournament(null);
        setPairs([]);
        setMatches([]);
        navigateToAppHome();
        return;
      }

      const route = getRouteForTournament(tournament);
      if (route !== "main" && user?.id) {
        continueTournament(tournament, {
          userId: user.id,
          onSelectMain: setSelectedTournament,
        });
        return;
      }

      setSelectedTournament(tournament);
      navigateToReta(tournament.id);
    },
    [user?.id, setPairs, setMatches]
  );

  // Restaurar reta round-robin / equipos desde /reta/:id tras F5
  useEffect(() => {
    if (authLoading) return;
    if (currentView !== "main" || !retaIdFromPath) {
      setRestoringRetaFromUrl(false);
      return;
    }
    if (!user?.id) {
      setRestoringRetaFromUrl(false);
      return;
    }
    if (selectedTournament?.id === retaIdFromPath) {
      setRestoringRetaFromUrl(false);
      return;
    }

    let cancelled = false;
    setRestoringRetaFromUrl(true);

    (async () => {
      try {
        const fetched = await getTournamentById(retaIdFromPath);
        if (cancelled) return;
        if (!fetched) {
          navigateToAppHome();
          setSelectedTournament(null);
          return;
        }

        const route = getRouteForTournament(fetched);
        if (route !== "main") {
          continueTournament(fetched, {
            userId: user.id,
            onSelectMain: setSelectedTournament,
          });
          return;
        }

        setSelectedTournament(fetched);
      } catch {
        if (!cancelled) {
          navigateToAppHome();
          setSelectedTournament(null);
        }
      } finally {
        if (!cancelled) setRestoringRetaFromUrl(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    currentView,
    retaIdFromPath,
    user?.id,
    selectedTournament?.id,
  ]);

  const {
    tournamentWinner,
    winningTeamName,
    winningTeamStats,
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
    (tournament?: Tournament) => {
      const target = tournament ?? selectedTournament;
      return target ? loadTournamentData(target) : undefined;
    },
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

  // Cargar datos cuando se selecciona torneo (refrescar format/team_config desde BD para que la tabla muestre equipos en producción)
  useEffect(() => {
    if (!selectedTournament) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await getTournamentById(selectedTournament.id);
        if (cancelled) return;
        const hasTeamConfigFromDb = fetched?.format === "teams" && fetched?.team_config?.teamNames?.length && fetched?.team_config?.pairToTeam && Object.keys(fetched.team_config.pairToTeam).length > 0;
        let merged: Tournament =
          fetched && (fetched.format != null || hasTeamConfigFromDb)
            ? { ...selectedTournament, ...fetched }
            : selectedTournament;
        const persistedFormat = readPersistedTournamentMode(selectedTournament.id);
        if (!merged.format && persistedFormat) {
          merged = { ...merged, format: persistedFormat };
        }
        if (merged !== selectedTournament) setSelectedTournament(merged);
        await loadTournamentData(merged);
      } catch {
        await loadTournamentData(selectedTournament);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournament?.id]); // Solo cuando cambia el torneo seleccionado

  // Reta nueva: abrir gestión de jugadores y parejas de inmediato
  useEffect(() => {
    if (!selectedTournament || selectedTournament.is_started) return;
    setShowPlayerManager(true);
    setShowPairManager(true);
  }, [selectedTournament]);

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

  useEffect(() => {
    if (loadError) {
      showToast(loadError, "error");
    }
  }, [loadError, showToast]);

  // Enlace corto: la config de equipos vive en tournament_public_config (Supabase). El hash #teams= era un respaldo; los enlaces viejos con hash siguen siendo leídos en PublicTournamentView.
  const generatePublicLink = (
    tournamentId: string,
    _teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null
  ) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/public/${tournamentId}`;
  };

  const copyPublicLink = async (
    tournamentId: string,
    teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null
  ) => {
    try {
      // Persistir en Supabase antes de copiar: el enlace ya no lleva #teams=; la vista pública lee tournament_public_config.
      if (teamConfig?.teamNames?.length && teamConfig?.pairToTeam) {
        await upsertTournamentPublicConfig(tournamentId, "teams", teamConfig);
      }
      const publicLink = generatePublicLink(tournamentId, teamConfig);
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
  const handleShowWinner = async () => {
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches;
    const teamConfig = selectedTournament
      ? await loadTeamConfigForTournament(selectedTournament)
      : null;
    const isTeamsFormat = Boolean(
      teamConfig || selectedTournament?.format === "teams"
    );
    const skipViewChange = isDesktop && !isTeamsFormat;
    const tournamentForCalc =
      teamConfig && selectedTournament
        ? {
            ...selectedTournament,
            format: "teams" as const,
            team_config: teamConfig,
          }
        : selectedTournament ?? undefined;

    await calculateAndShowWinner(pairs, matches, setCurrentView, {
      tournament: tournamentForCalc,
      skipViewChange,
    });

    if (skipViewChange) {
      requestAnimationFrame(() => {
        document
          .getElementById("reta-winner-celebrate")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };
  const handleHideWinner = () => hideWinnerScreen(setCurrentView);

  const handleBackToHome = () => {
    setSelectedTournament(null);
    setPairs([]);
    setMatches([]);
    setError("");
    setCurrentView("main");
    navigateToAppHome();
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
    void championshipRevision;
    return isRoundRobinTournamentComplete(matches, selectedTournament);
  }, [matches, selectedTournament, championshipRevision]);

  const winner = useMemo(() => {
    if (winningTeamName) return null;
    if (selectedTournament && resolveEffectiveTeamConfig(selectedTournament)) {
      return null;
    }
    return (
      tournamentWinner?.pair || (sortedPairs.length > 0 ? sortedPairs[0] : null)
    );
  }, [winningTeamName, selectedTournament, tournamentWinner, sortedPairs]);

  useEffect(() => {
    if (!isTournamentFinished || !selectedTournament) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const teamConfig = await loadTeamConfigForTournament(selectedTournament);
      if (cancelled) return;

      const tournamentForCalc =
        teamConfig != null
          ? {
              ...selectedTournament,
              format: "teams" as const,
              team_config: teamConfig,
            }
          : selectedTournament;

      if (teamConfig) {
        if (tournamentWinner || !winningTeamName) {
          await calculateAndShowWinner(pairs, matches, () => {}, {
            tournament: tournamentForCalc,
            skipViewChange: true,
          });
        }
        return;
      }

      if (tournamentWinner || winningTeamName) {
        return;
      }

      await calculateAndShowWinner(pairs, matches, () => {}, {
        tournament: tournamentForCalc,
        skipViewChange: true,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isTournamentFinished,
    selectedTournament,
    tournamentWinner,
    winningTeamName,
    pairs,
    matches,
    calculateAndShowWinner,
  ]);

  const isTorneoExpressPublic =
    currentView === "torneo-express" && isTorneoExpressPublicPath(appPathname);

  const isLigaPublic =
    currentView === "liga" && isLigaPublicPath(appPathname);

  const isDuelo2v2Public =
    currentView === "duelo-2v2" && isDuelo2v2PublicPath(appPathname);

  const isJugadoresPublic =
    currentView === "jugadores" && isJugadoresPublicPath(appPathname);

  const isPublicPantalla = currentView === "public-pantalla";

  const isPublicSpectatorView =
    currentView === "public" ||
    currentView === "public-americano" ||
    currentView === "public-americano-pantalla" ||
    isPublicPantalla ||
    isTorneoExpressPublic ||
    isLigaPublic ||
    isDuelo2v2Public ||
    isJugadoresPublic;

  const appShellClass = [
    "App",
    isPublicSpectatorView ? "App--public-full-width ro-public-view" : "",
    isJugadoresPublic ? "App--jugadores-public" : "",
    currentView === "legal" ? "App--legal" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={appShellClass}>
      <ProtectedRoute>
        {/* Solo mostrar UserHeader cuando NO estemos en vista pública NI en admin */}
        {currentView !== "public" &&
          currentView !== "public-americano" &&
          currentView !== "public-americano-pantalla" &&
          currentView !== "public-pantalla" &&
          !isTorneoExpressPublic &&
          !isLigaPublic &&
          !isDuelo2v2Public &&
          !isJugadoresPublic &&
          currentView !== "admin-login" &&
          currentView !== "admin-dashboard" &&
          currentView !== "admin-user" && <UserHeader />}

        {currentView === "torneo-express" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <TorneoExpressRouter key={appPathname} pathname={appPathname} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "liga" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <LigaRouter key={appPathname} pathname={appPathname} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "duelo-2v2" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <Duelo2v2Router key={appPathname} pathname={appPathname} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "public-pantalla" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <PublicPantallaRouter key={appPathname} pathname={appPathname} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "jugadores" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <JugadoresRouter key={appPathname} pathname={appPathname} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "legal" && <PrivacidadTerminosPage />}

        {currentView === "main" && !isAmericanoRoute && (
          <ErrorBoundary>
            <>
            {restoringRetaFromUrl && retaIdFromPath && !selectedTournament ? (
              <div className="loading-container">
                <div className="loading-spinner">
                  <div className="spinner" />
                  <p>⏳ Cargando reta…</p>
                </div>
              </div>
            ) : (
            <MainLayout
              selectedTournament={selectedTournament}
              onTournamentSelect={handleTournamentSelect}
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
              error={error}
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
              winningTeamName={winningTeamName}
              winningTeamStats={winningTeamStats}
              onShowWinnerScreen={handleShowWinner}
              onBackToHome={handleBackToHome}
            />
            )}
            </>
          </ErrorBoundary>
        )}

        {currentView === "americano-dinamico" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <AmericanoDinamicoScreen
            tournamentId={americanoTournamentId}
            userId={americanoUserId ?? user?.id ?? undefined}
            onTournamentStatusChange={(updates) => {
              if (!americanoTournamentId) return;
              setSelectedTournament((prev) => {
                if (!prev || prev.id !== americanoTournamentId) return prev;
                return { ...prev, ...updates };
              });
              if (updates.is_finished) {
                setForceRefresh((n) => n + 1);
              }
            }}
          />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "public" && publicTournamentId && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <PublicTournamentView tournamentId={publicTournamentId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "public-americano" && publicAmericanoTournamentId && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <PublicAmericanoView tournamentId={publicAmericanoTournamentId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {currentView === "public-americano-pantalla" &&
          publicAmericanoBoardTournamentId && (
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <PublicAmericanoResultsBoard
                  tournamentId={publicAmericanoBoardTournamentId}
                />
              </Suspense>
            </ErrorBoundary>
          )}

        {currentView === "auth-callback" && (
          <AuthCallback onSuccess={() => setCurrentView("main")} />
        )}

        {currentView === "auth-reset-password" && <ResetPasswordPage />}

        {currentView === "winner" && (
          <WinnerScreen
            isVisible={showWinnerScreen}
            winner={winner}
            tournamentWinner={tournamentWinner}
            winningTeamName={winningTeamName}
            winningTeamStats={winningTeamStats}
            userId={user?.id}
            torneoNombre={selectedTournament?.name}
            onBackToManager={handleHideWinner}
          />
        )}

        {/* Rutas de Admin */}
        {currentView === "admin-login" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
            <>
            {console.log("🔍 Renderizando AdminLogin")}
            <AdminLogin
              onLoginSuccess={() => {
                console.log(
                  "🔄 onLoginSuccess llamado - Redirigiendo a admin dashboard..."
                );
                window.history.replaceState({}, "", "/admin-dashboard");
                setCurrentView("admin-dashboard");
              }}
            />
            </>
            </Suspense>
          </ErrorBoundary>
        )}
        {currentView === "admin-dashboard" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
            <AdminRoute
              onUnauthorized={() => {
                console.log("🔄 Admin no autorizado, cambiando a admin-login");
                window.history.replaceState({}, "", "/admin-login");
                setCurrentView("admin-login");
              }}
            >
              <AdminDashboard />
            </AdminRoute>
            </Suspense>
          </ErrorBoundary>
        )}
        {currentView === "admin-user" && (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
            <AdminRoute
              onUnauthorized={() => {
                window.history.replaceState({}, "", "/admin-login");
                setCurrentView("admin-login");
              }}
            >
              <AdminUserManagePage
                userId={parseAdminUserIdFromPath(appPathname) ?? ""}
              />
            </AdminRoute>
            </Suspense>
          </ErrorBoundary>
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
        <AccountFeaturesProvider>
          <AdminProvider>
            <ClubExperienceProvider>
              <AppContent />
            </ClubExperienceProvider>
          </AdminProvider>
        </AccountFeaturesProvider>
      </UserProvider>
    </ThemeProvider>
  );
}

export default App;
