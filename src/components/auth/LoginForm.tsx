import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import "./AuthForms.css";

interface LoginFormProps {
  onToggleMode: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onToggleMode }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="auth-form-container">
      <div className="auth-form-card">
        <header className="auth-form-header">
          <div className="auth-form-header__brand">
            <span className="auth-form-header__brand-icon" aria-hidden>
              🏆
            </span>
            <span className="auth-form-header__brand-name">RivieraApp</span>
          </div>
          <h1>Bienvenido de vuelta</h1>
          <p>Ingresa tus datos para continuar</p>
        </header>

        <form onSubmit={handleSubmit} className="auth-form-content">
          {error && (
            <div className="auth-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <div className="auth-cta">
            <button
              type="submit"
              className="btn-auth-primary"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar al juego →"}
            </button>
          </div>
        </form>

        <footer className="auth-footer">
          <p>
            ¿Primera vez aquí?{" "}
            <button type="button" onClick={onToggleMode} className="auth-toggle-btn">
              Crear cuenta gratis
            </button>
          </p>
        </footer>
      </div>
    </div>
  );
};
