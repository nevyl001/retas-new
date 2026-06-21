import React, { useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { Button, Input } from "../ui";
import "./AuthForms.css";

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  onBackToLogin,
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { requestPasswordReset } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await requestPasswordReset(email.trim());

    if (resetError) {
      setError(resetError.message ?? "No se pudo enviar el correo. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="auth-form-container">
        <div className="auth-form-card auth-success-card">
          <header className="auth-form-header">
            <h1>Revisa tu correo</h1>
            <p>
              Si existe una cuenta con <strong>{email}</strong>, recibirás un
              enlace para restablecer tu contraseña.
            </p>
          </header>
          <p className="auth-success-note">
            Revisa también la carpeta de <strong>correo no deseado</strong>.
          </p>
          <div className="auth-cta">
            <button type="button" onClick={onBackToLogin} className="btn-auth-primary">
              Volver a iniciar sesión →
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
          <h1>Recuperar contraseña</h1>
          <p>Te enviaremos un enlace para elegir una nueva contraseña</p>
        </header>

        <form onSubmit={(e) => void handleSubmit(e)} className="auth-form-content">
          {error && (
            <div className="auth-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <Input
            id="forgot-email"
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

          <div className="auth-cta">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="btn-auth-primary"
              loading={loading}
              disabled={loading}
            >
              Enviar enlace
            </Button>
          </div>
        </form>

        <footer className="auth-footer">
          <p>
            <button type="button" onClick={onBackToLogin} className="auth-toggle-btn">
              ← Volver a iniciar sesión
            </button>
          </p>
        </footer>
      </div>
    </div>
  );
};
