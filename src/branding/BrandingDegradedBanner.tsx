import React, { useCallback, useEffect, useReducer, useState } from "react";
import {
  isBrandingBootstrapDegraded,
  retryBrandingBootstrap,
  subscribeBrandingBootstrapDegraded,
} from "./bootstrapAppBranding";
import "./BrandingDegradedBanner.css";

/**
 * Banner no bloqueante: se muestra solo si bootstrapAppBranding() tuvo que
 * caer al branding por defecto ante un fallo de red/Supabase. Ofrece un
 * reintento manual de un solo click (sin polling ni loop automático).
 */
export const BrandingDegradedBanner: React.FC = () => {
  const [, revision] = useReducer((n: number) => n + 1, 0);
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(
    () => subscribeBrandingBootstrapDegraded(() => revision()),
    []
  );

  const degraded = isBrandingBootstrapDegraded() && !dismissed;

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const ok = await retryBrandingBootstrap();
      if (ok) setDismissed(false);
    } finally {
      setRetrying(false);
    }
  }, []);

  if (!degraded) return null;

  return (
    <div className="branding-degraded-banner" role="status">
      <span className="branding-degraded-banner__text">
        No se pudo cargar el diseño de tu club. Puedes seguir usando la app.
      </span>
      <div className="branding-degraded-banner__actions">
        <button
          type="button"
          className="branding-degraded-banner__btn"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? "Reintentando…" : "Reintentar"}
        </button>
        <button
          type="button"
          className="branding-degraded-banner__btn branding-degraded-banner__btn--ghost"
          onClick={() => setDismissed(true)}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
