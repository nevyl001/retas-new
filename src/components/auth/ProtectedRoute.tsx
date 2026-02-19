import React from "react";
import { useUser } from "../../contexts/UserContext";
import { AuthPage } from "./AuthPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useUser();
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  // Rutas que no requieren login: cualquiera puede ver (incluye base path ej. /app/public/xxx)
  const isPublicRoute = currentPath.includes("/public/");
  const isAdminRoute =
    currentPath === "/admin-login" || currentPath === "/admin-dashboard";

  // Primero: si es vista pública o admin, mostrar contenido sin pedir sesión
  if (isPublicRoute || isAdminRoute) {
    return <>{children}</>;
  }

  // Si está cargando (solo para rutas que sí requieren login), mostrar loading
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

  // Si no hay usuario, mostrar página de autenticación
  if (!user) {
    return <AuthPage />;
  }

  return <>{children}</>;
};
