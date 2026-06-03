import React from "react";
import { useUser } from "../../contexts/UserContext";
import { pathRequiresUserSession } from "../../lib/appRouting";
import { AuthPage } from "./AuthPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useUser();
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  const isAdminRoute =
    currentPath === "/admin-login" || currentPath === "/admin-dashboard";

  // Ranking, cómo funciona, fichas /public/, torneo express público, etc.
  if (!pathRequiresUserSession(currentPath) || isAdminRoute) {
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
