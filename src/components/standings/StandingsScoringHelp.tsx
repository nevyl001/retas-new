import React from "react";
import "../../styles/standings-scoring-help.css";

interface StandingsScoringHelpProps {
  className?: string;
  /** Versión de una línea para tablas reducidas (p. ej. resumen americano). */
  compact?: boolean;
}

/** Texto breve: estadísticas en cancha vs orden de la tabla. */
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
        Orden: <strong>DIF</strong> → <strong>PG</strong> → enfrentamiento directo ·{" "}
        <strong>FAV</strong>/<strong>CON</strong> = juegos en cancha ·{" "}
        <strong>PTS</strong> = victoria 2 (solo referencia)
      </p>
    );
  }

  return (
    <aside
      className={`standings-scoring-help ${className}`.trim()}
      aria-label="Cómo se calcula la clasificación"
    >
      <p className="standings-scoring-help__title">¿Cómo se ordena la tabla?</p>
      <p className="standings-scoring-help__text">
        La posición se define así: primero mayor <strong>DIF</strong> (FAV − CON);
        si empatan, más <strong>PG</strong>; si siguen empatadas, gana quien ganó
        el enfrentamiento directo entre ellas. <strong>FAV</strong> y{" "}
        <strong>CON</strong> son los juegos anotados y recibidos en cancha.{" "}
        <strong>PTS</strong> (victoria 2, derrota 0) es solo informativo y no
        define el orden.
      </p>
      <p className="standings-scoring-help__legend">
        Orden · DIF → PG → H2H · PTS · Victoria 2 · Derrota 0
      </p>
    </aside>
  );
};
