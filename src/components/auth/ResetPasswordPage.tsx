import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useUser } from "../../contexts/UserContext";
import { navigateToAppHome } from "../../lib/appRouting";
import { Button } from "../ui";
import { PasswordField } from "./PasswordField";
import "./AuthForms.css";

type ResetPhase = "loading" | "ready" | "invalid" | "done";

export const ResetPasswordPage: React.FC = () => {
  const { updatePassword } = useUser();
  const [phase, setPhase] = useState<ResetPhase>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      setPhase("ready");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    };

    const checkSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError) {
        setPhase("invalid");
        return;
      }

      if (data.session) {
        markReady();
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        markReady();
      }
    });

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setPhase((current) => (current === "loading" ? "invalid" : current));
    }, 8000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    const { error: updateError } = await updatePassword(password);
    setLoading(false);

    if (updateError) {
      setError(updateError.message ?? "No se pudo actualizar la contraseña");
      return;
    }

    setPhase("done");
    window.setTimeout(() => navigateToAppHome(), 2500);
  };

  if (phase === "loading") {
    return (
      <div className="auth-form-container auth-standalone">
        <div className="auth-form-card">
          <header className="auth-form-header">
            <h1>Verificando enlace…</h1>
            <p>Espera un momento mientras validamos tu solicitud.</p>
          </header>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="auth-form-container auth-standalone">
        <div className="auth-form-card">
          <header className="auth-form-header">
            <h1>Enlace no válido</h1>
            <p>
              El enlace expiró o ya fue usado. Solicita uno nuevo desde iniciar
              sesión.
            </p>
          </header>
          <div className="auth-cta">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                window.history.replaceState({}, "", "/");
                window.location.reload();
              }}
            >
              Ir a iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="auth-form-container auth-standalone">
        <div className="auth-form-card auth-success-card">
          <header className="auth-form-header">
            <h1>¡Contraseña actualizada!</h1>
            <p>Tu contraseña se guardó correctamente. Entrando a RivieraApp…</p>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-container auth-standalone">
      <div className="auth-form-card">
        <header className="auth-form-header">
          <h1>Nueva contraseña</h1>
          <p>Elige una contraseña segura para tu cuenta</p>
        </header>

        <form onSubmit={(e) => void handleSubmit(e)} className="auth-form-content">
          {error && (
            <div className="auth-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <PasswordField
            id="new-password"
            label="Nueva contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            disabled={loading}
            autoComplete="new-password"
            minLength={6}
          />

          <PasswordField
            id="confirm-new-password"
            label="Confirmar contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repite la contraseña"
            required
            disabled={loading}
            autoComplete="new-password"
            minLength={6}
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
              Guardar contraseña
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
