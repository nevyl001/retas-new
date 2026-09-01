import React from "react";
import { Button } from "../../ui";

export interface JornadaAdminHeaderProps {
  ligaNombre: string;
  jornadaTitulo: string;
  estadoLabel: string;
  partidosCount: number;
  publicUrl: string;
  onCopyLink: () => void;
  onBack: () => void;
  copyFeedback?: boolean;
}

export const JornadaAdminHeader: React.FC<JornadaAdminHeaderProps> = ({
  ligaNombre,
  jornadaTitulo,
  estadoLabel,
  partidosCount,
  publicUrl,
  onCopyLink,
  onBack,
  copyFeedback,
}) => (
  <header className="jornada-admin-header">
    <div className="jornada-admin-header__nav">
      <Button type="button" variant="back" onClick={onBack}>
        ← {ligaNombre}
      </Button>
    </div>
    <div className="jornada-admin-header__main">
      <div className="jornada-admin-header__titles">
        <h1 className="jornada-admin-header__liga">{ligaNombre}</h1>
        <p className="jornada-admin-header__meta">
          <span className="jornada-admin-header__jornada">{jornadaTitulo}</span>
          <span className="jornada-admin-header__dot" aria-hidden>
            ·
          </span>
          <span>{estadoLabel}</span>
          {partidosCount > 0 ? (
            <>
              <span className="jornada-admin-header__dot" aria-hidden>
                ·
              </span>
              <span>{partidosCount} partidos</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="jornada-admin-header__actions">
        <a
          className="jornada-admin-header__action"
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Vista pública
        </a>
        <button
          type="button"
          className="jornada-admin-header__action jornada-admin-header__action--primary"
          onClick={onCopyLink}
        >
          {copyFeedback ? "Enlace copiado" : "Copiar enlace"}
        </button>
      </div>
    </div>
  </header>
);
