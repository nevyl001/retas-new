import React from "react";

export const PublicTorneoExpressSyncFooter: React.FC<{
  lastRefreshedAt?: Date | null;
}> = ({ lastRefreshedAt }) => (
  <footer className="te-public-sync-footer te-pub-fade-in" aria-live="polite">
    <p className="te-public-sync-footer__line">
      Esta página se actualiza automáticamente cada 60 segundos
      {lastRefreshedAt
        ? ` · Última actualización: ${lastRefreshedAt.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}`
        : ""}
    </p>
    <p className="te-public-sync-footer__line">
      Vista pública · solo lectura
    </p>
  </footer>
);
