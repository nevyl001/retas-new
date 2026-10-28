import React from "react";
import "./riviera-jugadores.css";

function formatRating(rating?: number | null): string {
  if (rating != null && Number.isFinite(rating)) {
    return rating.toFixed(2);
  }
  return "3.00";
}

export const JugadorRatingChip: React.FC<{
  rating?: number | null;
  className?: string;
  /**
   * Prefijo visible (p. ej. "RATING ORIGINAL").
   * Si `rating` es null y hay `emptyLabel`, muestra ese texto en lugar de 3.00.
   */
  caption?: string;
  emptyLabel?: string;
}> = ({ rating, className = "", caption, emptyLabel }) => {
  const hasRating = rating != null && Number.isFinite(rating);
  const valueLabel = hasRating
    ? formatRating(rating)
    : emptyLabel
      ? emptyLabel
      : formatRating(null);
  const aria = hasRating
    ? `${caption ? `${caption} ` : "Nivel "}${valueLabel}`
    : emptyLabel || `Nivel ${valueLabel}`;

  return (
    <span
      className={`jugador-rating-chip${
        !hasRating && emptyLabel ? " jugador-rating-chip--empty" : ""
      }${className ? ` ${className}` : ""}`}
      aria-label={aria}
      title={aria}
    >
      {hasRating && caption ? (
        <>
          <span className="jugador-rating-chip__caption">{caption}</span>
          <span className="jugador-rating-chip__value">{valueLabel}</span>
        </>
      ) : (
        valueLabel
      )}
    </span>
  );
};
