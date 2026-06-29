import React, { useState } from "react";
import { useAdmin } from "../../contexts/AdminContext";
import { ClubIdentity } from "../../club-experience";
import { RIVIERA_MOTHER_BRAND_NAME } from "../../lib/rivieraBranding";
import "./AdminLogin.css";

interface AdminLoginProps {
  onLoginSuccess?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const { loginAdmin, loading } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const busy = isLoading || loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await loginAdmin(email, password);

      if (result.success) {
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          window.location.href = "/admin-dashboard";
        }
        return;
      } else {
        setError(result.error || "Error al iniciar sesión");
      }
    } catch (err) {
      console.error("Error inesperado en login:", err);
      setError("Error inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-page__glow" aria-hidden="true" />

      <main className="admin-login-card">
        <header className="admin-login-card__header">
          <div className="admin-login-brand">
            <ClubIdentity variant="auth" showTagline logoSurface="dark" />
          </div>
          <h1 className="admin-login-card__title">Administración</h1>
          <p className="admin-login-card__subtitle">
            Inicia sesión con tu cuenta de administrador
          </p>
        </header>

        <form onSubmit={handleSubmit} className="admin-login-form" noValidate>
          <div className="admin-login-field">
            <label htmlFor="admin-email" className="admin-login-label">
              Correo electrónico
            </label>
            <input
              id="admin-email"
              type="email"
              className="admin-login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              required
              disabled={busy}
            />
          </div>

          <div className="admin-login-field">
            <label htmlFor="admin-password" className="admin-login-label">
              Contraseña
            </label>
            <input
              id="admin-password"
              type="password"
              className="admin-login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Introduce tu contraseña"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>

          {error ? (
            <div className="admin-login-error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="admin-login-submit"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <span className="admin-login-submit__spinner" aria-hidden="true" />
                <span>Verificando acceso</span>
              </>
            ) : (
              <span>Continuar</span>
            )}
          </button>
        </form>

        <footer className="admin-login-card__footer">
          <span>Panel restringido</span>
          <span className="admin-login-card__dot" aria-hidden="true" />
          <span>{RIVIERA_MOTHER_BRAND_NAME}</span>
        </footer>
      </main>
    </div>
  );
};
