import React, { useState, useEffect } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import "./AdminLogin.css";

interface AdminLoginProps {
  onLoginSuccess?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const { loginAdmin, loading, isAdminLoggedIn } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  console.log("🔍 AdminLogin renderizado");

  // Redirigir si ya está logueado como admin
  useEffect(() => {
    if (isAdminLoggedIn) {
      console.log("🔄 Admin ya logueado, redirigiendo...");
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        window.location.href = "/admin-dashboard";
      }
    }
  }, [isAdminLoggedIn, onLoginSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      console.log("🔐 Llamando a loginAdmin con:", { email, password });
      const result = await loginAdmin(email, password);
      console.log("📊 Resultado de loginAdmin:", result);

      if (result.success) {
        console.log("✅ Login exitoso, redirigiendo...");
        // Redirigir al dashboard
        if (onLoginSuccess) {
          console.log("🔄 Llamando onLoginSuccess...");
          onLoginSuccess();
        } else {
          console.log("🔄 Usando window.location.href...");
          window.location.href = "/admin-dashboard";
        }
        return; // Salir inmediatamente
      } else {
        console.log("❌ Login falló:", result.error);
        setError(result.error || "Error al iniciar sesión");
      }
    } catch (err) {
      console.error("❌ Error inesperado en login:", err);
      setError("Error inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-background">
        <div className="admin-login-pattern"></div>
      </div>

      <div className="admin-login-card">
        <div className="admin-login-header">
          <div className="admin-logo">
            <div className="admin-logo-icon">🛡️</div>
            <h1>Panel de Administración</h1>
          </div>
          <p className="admin-subtitle">Acceso Seguro de Administrador</p>
          <div className="admin-security-badge">
            <span className="security-icon">🔒</span>
            <span>Conexión Segura</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-form-group">
            <label htmlFor="email">
              <span className="label-icon">📧</span>
              Email de Administrador
            </label>
            <div className="input-container">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@test.com"
                required
                disabled={isLoading}
                className="admin-input"
              />
              <div className="input-icon">👤</div>
            </div>
          </div>

          <div className="admin-form-group">
            <label htmlFor="password">
              <span className="label-icon">🔑</span>
              Contraseña de Acceso
            </label>
            <div className="input-container">
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="admin-input"
              />
              <div className="input-icon">🔐</div>
            </div>
          </div>

          {error && (
            <div className="admin-error">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="admin-login-btn"
            disabled={isLoading || loading}
          >
            <span className="btn-icon">{isLoading ? "⏳" : "🚀"}</span>
            <span className="btn-text">
              {isLoading ? "Verificando Acceso..." : "Acceder al Panel"}
            </span>
          </button>
        </form>

        <div className="admin-login-footer">
          <div className="admin-info">
            <div className="info-item">
              <span className="info-icon">🏆</span>
              <span>Retas de Pádel</span>
            </div>
            <div className="info-item">
              <span className="info-icon">🛡️</span>
              <span>Panel de Administración</span>
            </div>
          </div>
          <div className="admin-version">
            <span>v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};
