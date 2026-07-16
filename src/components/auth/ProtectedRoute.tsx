import React, { useEffect } from "react";
import { useClubExperience } from "../../club-experience";
import { useUser } from "../../contexts/UserContext";
import {
  normalizeAppPathname,
  pathRequiresUserSession,
  resetProtectedPathToAppHome,
} from "../../lib/appRouting";
import { isJugadoresPublicPath } from "../jugadores/JugadoresRouter";
import { isLigaPublicPath } from "../liga/LigaRouter";
import { isTorneoExpressPublicPath } from "../torneo-express/TorneoExpressRouter";
import { isRetaAbiertaPublicPath } from "../../lib/retaAbierta/retaAbiertaService";
import { AuthPage } from "./AuthPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function isPublicAppPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  if (!pathRequiresUserSession(path)) return true;
  if (path.includes("/public/")) return true;
  if (isJugadoresPublicPath(path)) return true;
  if (isTorneoExpressPublicPath(path)) return true;
  if (isLigaPublicPath(path)) return true;
  if (isRetaAbiertaPublicPath(path)) return true;
  if (path === "/admin-login" || path === "/admin-dashboard") return true;
  if (path === "/admin/dev/player-debug") return true;
  if (/^\/admin-dashboard\/usuario\//i.test(path)) return true;
  if (path === "/auth/callback") return true;
  if (path === "/auth/reset-password") return true;
  return false;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useUser();
  const { isBrandingReady, isBrandingTransitioning } = useClubExperience();
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  useEffect(() => {
    if (loading || user || isBrandingTransitioning || !isBrandingReady) return;
    if (!pathRequiresUserSession(normalizeAppPathname(currentPath))) return;
    resetProtectedPathToAppHome();
  }, [
    loading,
    user,
    currentPath,
    isBrandingTransitioning,
    isBrandingReady,
  ]);

  if (isPublicAppPath(currentPath)) {
    return <>{children}</>;
  }

  if (loading || isBrandingTransitioning || !isBrandingReady) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>⏳ Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <>{children}</>;
};
