import React, { useState, useEffect } from "react";
import { useUser } from "../../contexts/UserContext";
import { AuthPage } from "./AuthPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useUser();

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

  // Si no hay usuario, mostrar página de autenticación
  if (!user) {
    return <AuthPage />;
  }

  // Si hay usuario, mostrar la aplicación
  return <>{children}</>;
};
