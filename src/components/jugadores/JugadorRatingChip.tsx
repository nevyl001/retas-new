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
}> = ({ rating, className = "" }) => {
  const label = formatRating(rating);
  return (
    <span
      className={`jugador-rating-chip${className ? ` ${className}` : ""}`}
      aria-label={`Nivel ${label}`}
      title={`Nivel ${label}`}
    >
      {label}
    </span>
  );
};
