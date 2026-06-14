import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../ui";
import "./AuthForms.css";

interface AuthCallbackProps {
  onSuccess?: () => void;
}

export const AuthCallback: React.FC<AuthCallbackProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log("🔄 Procesando callback de autenticación...");

        // Obtener la sesión actual
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("❌ Error en callback:", error);
          setError(
            "Error al confirmar tu cuenta. Por favor, intenta de nuevo."
          );
          setLoading(false);
          return;
        }

        if (data.session) {
          console.log("✅ Usuario autenticado exitosamente");
          // Redirigir al dashboard después de 2 segundos
          setTimeout(() => {
            if (onSuccess) {
              onSuccess();
            } else {
              window.location.href = "/";
            }
          }, 2000);
        } else {
          console.log("⚠️ No hay sesión activa");
          setError(
            "No se pudo confirmar tu cuenta. Por favor, intenta de nuevo."
          );
          setLoading(false);
        }
      } catch (err) {
        console.error("❌ Error en callback:", err);
        setError("Error inesperado. Por favor, intenta de nuevo.");
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [onSuccess]);

  if (loading) {
    return (
      <div className="auth-form-container">
        <div className="auth-form">
          <div className="auth-success">
            <h2>⏳ Confirmando tu cuenta...</h2>
            <p>Por favor espera mientras confirmamos tu email.</p>
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "4px solid var(--ro-accent, #ffffff)",
                borderTop: "4px solid transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "20px auto",
              }}
            ></div>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-form-container">
        <div className="auth-form">
          <div className="auth-error">
            <h2>❌ Error de Confirmación</h2>
            <p>{error}</p>
            <Button
              type="button"
              variant="primary"
              onClick={() => (window.location.href = "/")}
              className="auth-submit-btn"
            >
              Volver al Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form-container">
      <div className="auth-form">
        <div className="auth-success">
          <h2>✅ ¡Cuenta Confirmada!</h2>
          <p>Tu email ha sido confirmado exitosamente.</p>
          <p>Te redirigiremos al dashboard en unos segundos...</p>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid var(--ro-accent, #ffffff)",
              borderTop: "4px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "20px auto",
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};
