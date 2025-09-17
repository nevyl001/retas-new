import React from "react";
import { useUser } from "../../contexts/UserContext";
import { AuthPage } from "./AuthPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useUser();

  // Verificar si estamos en una ruta de admin
  const isAdminRoute = () => {
    const currentPath = window.location.pathname;
    return currentPath === "/admin-login" || currentPath === "/admin-dashboard";
  };

  // Si está cargando, mostrar loading
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

  // Si estamos en una ruta de admin, siempre mostrar children (no verificar usuario)
  if (isAdminRoute()) {
    console.log(
      "🔍 Ruta de admin detectada, mostrando children sin verificar usuario"
    );
    return <>{children}</>;
  }

  // Si no hay usuario, mostrar página de autenticación
  if (!user) {
    return <AuthPage />;
  }

  // Si hay usuario, mostrar la aplicación
  return <>{children}</>;
};
