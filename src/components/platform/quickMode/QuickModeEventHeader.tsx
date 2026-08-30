import React from "react";

export type QuickModeEventHeaderMeta = {
  label: string;
  value: React.ReactNode;
};

export type QuickModeEventHeaderProps = {
  club?: string | null;
  title: string;
  modality: string;
  statusLabel: string;
  /** Fase bajo el título (p. ej. Preparación / En juego). */
  phaseLabel?: string;
  /** Métricas centrales (jugadores, parejas, canchas, duración). */
  centerMetrics?: QuickModeEventHeaderMeta[];
  /** Bloque derecho (fecha, lugar). */
  rightMeta?: QuickModeEventHeaderMeta[];
  /**
   * Alternativa compacta a centerMetrics: una sola línea ya formateada
   * ("26 jugadores · 2 parejas · 2 canchas · 120 min"). Si se pasa, tiene
   * prioridad sobre centerMetrics para esa zona.
   */
  centerSummaryLine?: React.ReactNode;
  /** Alternativa compacta a rightMeta, misma idea para fecha/lugar. */
  rightSummaryLine?: React.ReactNode;
  onEditDetails?: () => void;
  editDetailsLabel?: string;
  className?: string;
};

/** Cabecera compacta en 3 zonas: identidad | métricas | fecha/lugar. */
export function QuickModeEventHeader({
  club,
  title,
  modality,
  statusLabel,
  phaseLabel = "Preparación",
  centerMetrics = [],
  rightMeta = [],
  centerSummaryLine,
  rightSummaryLine,
  onEditDetails,
  editDetailsLabel = "Editar detalles",
  className = "",
}: QuickModeEventHeaderProps) {
  return (
    <header className={`qm-event-header ${className}`.trim()}>
      <div className="qm-event-header__left">
        {club ? <p className="qm-event-header__club">{club}</p> : null}
        <div className="qm-event-header__title-row">
          <h1 className="qm-event-header__title">{title}</h1>
          <span className="qm-event-header__status">{statusLabel}</span>
        </div>
        <p className="qm-event-header__modality">
          {modality}
          <span className="qm-event-header__dot" aria-hidden>
            ·
          </span>
          {phaseLabel}
        </p>
      </div>

      {centerSummaryLine ? (
        <div className="qm-event-header__summary-line" aria-label="Resumen del evento">
          {centerSummaryLine}
        </div>
      ) : centerMetrics.length > 0 ? (
        <ul
          className="qm-event-header__center"
          aria-label="Resumen del evento"
        >
          {centerMetrics.map((item) => (
            <li key={item.label} className="qm-event-header__metric">
              <span className="qm-event-header__metric-label">{item.label}</span>
              <span className="qm-event-header__metric-value">{item.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="qm-event-header__right">
        {rightSummaryLine ? (
          <p className="qm-event-header__summary-line qm-event-header__summary-line--right">
            {rightSummaryLine}
          </p>
        ) : rightMeta.length > 0 ? (
          <ul className="qm-event-header__right-meta">
            {rightMeta.map((item) => (
              <li key={item.label} className="qm-event-header__metric">
                <span className="qm-event-header__metric-label">
                  {item.label}
                </span>
                <span className="qm-event-header__metric-value">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {onEditDetails ? (
          <button
            type="button"
            className="qm-event-header__edit"
            onClick={onEditDetails}
          >
            {editDetailsLabel}
          </button>
        ) : null}
      </div>
    </header>
  );
}
