import React from "react";
import "./PublicEventNeutralLoading.css";

type PublicEventNeutralLoadingProps = {
  message?: string;
  className?: string;
};

/**
 * Loader público sin identidad de tenant.
 * Usar mientras organizadorId / branding del scope aún no están resueltos.
 */
export const PublicEventNeutralLoading: React.FC<
  PublicEventNeutralLoadingProps
> = ({ message = "Cargando resultados…", className = "" }) => {
  return (
    <div
      className={`public-event-neutral-loading ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="public-event-neutral-loading__pulse" aria-hidden />
      <p>{message}</p>
    </div>
  );
};
