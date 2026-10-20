import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../ui";
import { navigateAppTo, navigateToAppHome } from "../../lib/appRouting";
import "./AuthForms.css";

/**
 * Sanitiza una ruta de redirección interna para prevenir ataques de Open Redirect.
 * Permite únicamente rutas internas relativas bien formadas (ej: "/coaching/mi-espacio").
 * Rechaza:
 * - URLs absolutas con esquema (http:, https:, javascript:, data:, etc.)
 * - URLs protocol-relative ("//evil.com")
 * - Rutas con caracteres de escape o barras invertidas ("/\evil.com", "/\\evil.com")
 * - Rutas con caracteres de control o no imprimibles
 */
export function sanitizeInternalRedirect(
  target: string | null | undefined,
  fallback: string = "/"
): string {
  if (!target || typeof target !== "string") {
    return fallback;
  }

  const trimmed = target.trim();
  if (!trimmed) {
    return fallback;
  }

  // Debe comenzar estrictamente con una sola barra diagonal '/'
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Prevenir protocol-relative URLs (ej: "//evil.com")
  if (trimmed.startsWith("//")) {
    return fallback;
  }

  // Prevenir barras invertidas (ej: "/\evil.com" que navegadores interpretan como dominio)
  if (trimmed.includes("\\")) {
    return fallback;
  }

  // Prevenir caracteres de control o saltos de línea
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code === 127) {
      return fallback;
    }
  }

  // Prevenir esquemas incrustados antes de cualquier '?' o '#'
  const pathPart = trimmed.split(/[?#]/)[0];
  if (pathPart.includes(":")) {
    return fallback;
  }

  return trimmed;
}

interface AuthCallbackProps {
  onSuccess?: (targetPath?: string) => void;
}

export const AuthCallback: React.FC<AuthCallbackProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Obtener la sesión actual tras confirmar email o invitación
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
          // Extraer y sanitizar destino interno de ?next= o ?redirectTo=
          let destination = "/";
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const rawTarget = params.get("next") || params.get("redirectTo");
            destination = sanitizeInternalRedirect(rawTarget, "/");
          }

          // Redirigir de forma segura tras 1.5 segundos
          setTimeout(() => {
            if (onSuccess) {
              onSuccess(destination);
            } else if (destination && destination !== "/") {
              navigateAppTo(destination);
            } else {
              navigateToAppHome();
            }
          }, 1500);
        } else {
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
                border: "4px solid var(--ro-accent)",
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
              onClick={() => navigateToAppHome()}
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
          <p>Te redirigiremos a tu espacio en unos segundos...</p>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid var(--ro-accent)",
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
