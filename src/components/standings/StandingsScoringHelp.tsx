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
        Orden: más <strong>FAV</strong> → <strong>DIF</strong> → H2H →{" "}
        <strong>PG</strong> · <strong>PTS</strong> = victoria 2 (solo referencia)
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
        Primero va quien hizo más games (<strong>FAV</strong>), aunque la
        diferencia sea negativa. Si empatan en FAV, gana mayor{" "}
        <strong>DIF</strong> (FAV − CON); luego enfrentamiento directo y, al final, más{" "}
        <strong>PG</strong>. <strong>PTS</strong> (victoria 2, derrota 0) es solo
        informativo.
      </p>
      <p className="standings-scoring-help__legend">
        Orden · FAV → DIF → H2H → PG · PTS · Victoria 2 · Derrota 0
      </p>
    </aside>
  );
};
