import React, { useEffect } from "react";
import { useAdmin } from "../../contexts/AdminContext";

interface AdminRouteProps {
  children: React.ReactNode;
  onUnauthorized?: () => void;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({
  children,
  onUnauthorized,
}) => {
  const { isAdminLoggedIn, loading } = useAdmin();

  useEffect(() => {
    if (!loading && !isAdminLoggedIn) {
      console.log("❌ Admin no autorizado, redirigiendo...");
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        // Usar history.pushState en lugar de window.location.href
        window.history.pushState({}, "", "/admin-login");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
  }, [isAdminLoggedIn, loading, onUnauthorized]);

  if (loading) {
    return (
      <div className="admin-loading-container">
        <div className="admin-loading">
          <h2>⏳ Verificando acceso...</h2>
        </div>
      </div>
    );
  }

  if (!isAdminLoggedIn) {
    return (
      <div className="admin-loading-container">
        <div className="admin-loading">
          <h2>❌ Acceso denegado</h2>
          <p>Redirigiendo al login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
