import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { Button, Input } from "../ui";
import { PasswordField } from "./PasswordField";
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
          <h1>Crea tu cuenta</h1>
          <p>Empieza a organizar tus retas en minutos</p>
        </header>

        <form onSubmit={handleSubmit} className="auth-form-content">
          {error && (
            <div className="auth-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <Input
            id="name"
            className="auth-field"
            label="Nombre"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            required
            disabled={loading}
            autoComplete="name"
          />

          <Input
            id="register-email"
            className="auth-field"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            required
            disabled={loading}
            autoComplete="email"
          />

          <PasswordField
            id="register-password"
            label="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            disabled={loading}
            autoComplete="new-password"
            hint="Usa «Mostrar» para verificar lo que escribes"
          />

          <PasswordField
            id="confirmPassword"
            label="Confirmar contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repite la contraseña"
            required
            disabled={loading}
            autoComplete="new-password"
          />

          <div className="auth-cta auth-cta--register">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="btn-auth-primary"
              loading={loading}
              disabled={loading}
            >
              {loading ? "Creando cuenta…" : "Crear cuenta →"}
            </Button>
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
