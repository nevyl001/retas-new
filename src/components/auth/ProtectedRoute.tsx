import React from "react";
import { useUser } from "../../contexts/UserContext";
import { normalizeAppPathname, pathRequiresUserSession } from "../../lib/appRouting";
import { isJugadoresPublicPath } from "../jugadores/JugadoresRouter";
import { isLigaPublicPath } from "../liga/LigaRouter";
import { isTorneoExpressPublicPath } from "../torneo-express/TorneoExpressRouter";
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
  if (path === "/admin-login" || path === "/admin-dashboard") return true;
  if (path === "/auth/callback") return true;
  return false;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useUser();
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  if (isPublicAppPath(currentPath)) {
    return <>{children}</>;
  }

  if (loading) {
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
