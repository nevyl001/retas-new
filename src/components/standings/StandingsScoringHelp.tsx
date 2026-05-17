import React from "react";
import "../../styles/standings-scoring-help.css";

interface StandingsScoringHelpProps {
  className?: string;
  /** Versión de una línea para tablas reducidas (p. ej. resumen americano). */
  compact?: boolean;
}

/** Texto breve para que el usuario distinga juegos en cancha (FAV/CON) vs puntos de tabla (PTS). */
export const StandingsScoringHelp: React.FC<StandingsScoringHelpProps> = ({
  className = "",
  compact = false,
}) => {
  if (compact) {
    return (
      <p
        className={`standings-scoring-help standings-scoring-help--compact ${className}`.trim()}
        aria-label="Cómo se calcula la clasificación"
      >
        <strong>FAV</strong> / <strong>CON</strong> = juegos anotados y recibidos ·{" "}
        <strong>DIF</strong> = FAV − CON · <strong>PTS</strong> de tabla: victoria 2,
        empate 1, derrota 0
      </p>
    );
  }

  return (
    <aside
      className={`standings-scoring-help ${className}`.trim()}
      aria-label="Cómo se calcula la clasificación"
    >
      <p className="standings-scoring-help__title">¿Cómo se calcula el puntaje?</p>
      <p className="standings-scoring-help__text">
        <strong>FAV</strong> y <strong>CON</strong> son los juegos que anotaste y
        los que recibiste en cada partido. <strong>DIF</strong> = FAV − CON.{" "}
        <strong>PTS</strong> son puntos de tabla para el ranking (victoria 2,
        empate 1, derrota 0): no son los juegos anotados; por ejemplo, 3 victorias
        = 6 PTS.
      </p>
      <p className="standings-scoring-help__legend">
        PTS · Victoria 2 · Empate 1 · Derrota 0
      </p>
    </aside>
  );
};
