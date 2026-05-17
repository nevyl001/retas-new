import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import "./AuthForms.css";

interface RegisterFormProps {
  onToggleMode: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onToggleMode }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { signUp } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, name);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="auth-form-container">
        <div className="auth-form-card auth-success-card">
          <header className="auth-form-header">
            <h1>¡Cuenta creada!</h1>
            <p>
              Te enviamos un correo de confirmación a <strong>{email}</strong>
            </p>
          </header>
          <p>
            Revisa tu bandeja de entrada y activa tu cuenta con el enlace del
            mensaje.
          </p>
          <p className="auth-success-note">
            Si no lo ves, revisa también la carpeta de{" "}
            <strong>correo no deseado</strong>.
          </p>
          <div className="auth-cta">
            <button
              type="button"
              onClick={onToggleMode}
              className="btn-auth-primary"
            >
              Ir a iniciar sesión →
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <h1>Crea tu cuenta</h1>
          <p>Empieza a organizar tus retas en minutos</p>
        </header>

        <form onSubmit={handleSubmit} className="auth-form-content">
          {error && (
            <div className="auth-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="name">
              Nombre
            </label>
            <input
              id="name"
              className="auth-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              required
              disabled={loading}
              autoComplete="name"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
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
            <label className="auth-label" htmlFor="register-password">
              Contraseña
            </label>
            <input
              id="register-password"
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="confirmPassword">
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              className="auth-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <div className="auth-cta auth-cta--register">
            <button
              type="submit"
              className="btn-auth-primary"
              disabled={loading}
            >
              {loading ? "Creando cuenta…" : "Crear cuenta →"}
            </button>
          </div>
        </form>

        <footer className="auth-footer">
          <p>
            ¿Ya tienes cuenta?{" "}
            <button type="button" onClick={onToggleMode} className="auth-toggle-btn">
              Iniciar sesión
            </button>
          </p>
        </footer>
      </div>
    </div>
  );
};
