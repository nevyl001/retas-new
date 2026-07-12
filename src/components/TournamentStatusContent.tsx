import React from "react";
import { Button } from "./ui";

interface TournamentStatusContentProps {
  tournament: {
    is_finished: boolean;
    is_started: boolean;
  };
  pairsCount: number;
  loading: boolean;
  onReset: () => void;
  /** Incluye el botón de reset (desktop). En móvil el reset va en Zona de peligro. */
  showReset?: boolean;
  /** Layout denso para el tab Config. móvil. */
  compact?: boolean;
}

export const TournamentStatusContent: React.FC<
  TournamentStatusContentProps
> = ({
  tournament,
  pairsCount,
  loading,
  onReset,
  showReset = true,
  compact = false,
}) => {
  const estadoLabel = tournament.is_finished
    ? "Finalizada"
    : tournament.is_started
      ? "En progreso"
      : "Pendiente";
  const infoLabel = tournament.is_finished
    ? "Exitosa"
    : tournament.is_started
      ? "Activa"
      : "Sin iniciar";

  if (compact) {
    return (
      <div className="reta-config-status">
        <h3 className="reta-config-status__title">Estado de la reta</h3>
        <dl className="reta-config-status__grid">
          <div className="reta-config-status__row">
            <dt>Estado</dt>
            <dd>
              <span
                className={`reta-config-status__dot${
                  tournament.is_finished
                    ? " reta-config-status__dot--done"
                    : tournament.is_started
                      ? " reta-config-status__dot--live"
                      : ""
                }`}
                aria-hidden
              />
              {estadoLabel}
            </dd>
          </div>
          <div className="reta-config-status__row">
            <dt>Parejas</dt>
            <dd>{pairsCount}</dd>
          </div>
          <div className="reta-config-status__row">
            <dt>Info</dt>
            <dd>{infoLabel}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="elegant-reta-status">
      <div className="elegant-status-header">
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <p>Estado de la Reta</p>
          </div>
        </div>
      </div>

      <div className="elegant-status-indicators">
        <div className="elegant-status-card">
          <div className="elegant-status-icon">
            <span className="elegant-status-dot reta-status"></span>
          </div>
          <div className="elegant-status-info">
            <span className="elegant-status-label">ESTADO</span>
            <span className="elegant-status-value">{estadoLabel}</span>
          </div>
        </div>

        <div className="elegant-status-card">
          <div className="elegant-status-icon">
            <span className="elegant-status-dot pairs-status"></span>
          </div>
          <div className="elegant-status-info">
            <span className="elegant-status-label">PAREJAS</span>
            <span className="elegant-status-value">{pairsCount}</span>
          </div>
        </div>

        <div className="elegant-status-card">
          <div className="elegant-status-icon">
            <span className="elegant-status-dot info-status"></span>
          </div>
          <div className="elegant-status-info">
            <span className="elegant-status-label">INFO</span>
            <span className="elegant-status-value">{infoLabel}</span>
          </div>
        </div>
      </div>

      <div className="elegant-status-details">
        <div className="elegant-detail-item">
          <span className="elegant-detail-icon" aria-hidden>
            ✓
          </span>
          <span className="elegant-detail-text">
            {tournament.is_finished
              ? "La reta ha sido finalizada exitosamente"
              : tournament.is_started
                ? "La reta ya está iniciada y en progreso"
                : "La reta aún no ha iniciado"}
          </span>
        </div>
        <div className="elegant-detail-item">
          <span className="elegant-detail-icon" aria-hidden>
            👥
          </span>
          <span className="elegant-detail-text">
            Tienes {pairsCount} parejas registradas
          </span>
        </div>
      </div>

      {showReset ? (
        <button
          className="elegant-reset-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!loading) onReset();
          }}
          disabled={loading}
          type="button"
        >
          <div className="elegant-reset-content">
            <span className="elegant-reset-icon" aria-hidden>
              {loading ? "⏳" : "↻"}
            </span>
            <span className="elegant-reset-text">
              {loading ? "Reseteando..." : "Resetear Reta"}
            </span>
          </div>
        </button>
      ) : null}
    </div>
  );
};

type RetaConfigDangerResetProps = {
  loading: boolean;
  onReset: () => void;
};

/** Acción destructiva del tab Config. móvil — separada del estado. */
export const RetaConfigDangerReset: React.FC<RetaConfigDangerResetProps> = ({
  loading,
  onReset,
}) => (
  <div className="reta-danger-zone">
    <h3 className="reta-danger-zone__title">Zona de peligro</h3>
    <p className="reta-danger-zone__hint">
      Resetear borra partidos y clasificación. Las parejas se mantienen.
    </p>
    <Button
      type="button"
      variant="danger"
      disabled={loading}
      loading={loading}
      onClick={() => {
        if (!loading) onReset();
      }}
    >
      {loading ? "Reseteando…" : "Resetear reta"}
    </Button>
  </div>
);
