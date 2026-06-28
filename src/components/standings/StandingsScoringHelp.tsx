import React from "react";
import "../../styles/standings-scoring-help.css";

interface StandingsScoringHelpProps {
  className?: string;
  /** Versión de una línea para tablas reducidas (p. ej. resumen americano). */
  compact?: boolean;
  /** Torneo Express: PG → DIF → H2H */
  variant?: "default" | "express";
}

/** Texto breve: estadísticas en cancha vs orden de la tabla. */
export const StandingsScoringHelp: React.FC<StandingsScoringHelpProps> = ({
  className = "",
  compact = false,
  variant = "default",
}) => {
  if (compact) {
    const compactText =
      variant === "express" ? (
        <>
          Orden: más <strong>PG</strong> → <strong>DIF</strong> → H2H ·{" "}
          <strong>PTS</strong> = victoria 2 (solo referencia)
        </>
      ) : (
        <>
          Orden: más <strong>FAV</strong> → <strong>DIF</strong> → H2H →{" "}
          <strong>PG</strong> · <strong>PTS</strong> = victoria 2 (solo referencia)
        </>
      );
    return (
      <p
        className={`standings-scoring-help standings-scoring-help--compact ${className}`.trim()}
        aria-label="Cómo se calcula la clasificación"
      >
        {compactText}
      </p>
    );
  }

  const helpText =
    variant === "express" ? (
      <>
        Primero más <strong>PG</strong> (partidos ganados). Si empatan, gana mayor{" "}
        <strong>DIF</strong> (FAV − CON); luego enfrentamiento directo.{" "}
        <strong>PTS</strong> (victoria 2, derrota 0) es solo informativo.
      </>
    ) : (
      <>
        Primero va quien hizo más games (<strong>FAV</strong>), aunque la
        diferencia sea negativa. Si empatan en FAV, gana mayor{" "}
        <strong>DIF</strong> (FAV − CON); luego <strong>enfrentamiento directo</strong>{" "}
        (H2H): quien ganó cuando se enfrentaron; si empatan 1-1 en cruces, cuenta el{" "}
        <strong>último</strong>. Al final, más <strong>PG</strong>.{" "}
        <strong>PTS</strong> (victoria 2, derrota 0) es solo informativo. Los
        emparejamientos del americano usan rotación equilibrada; el ranking solo
        ordena la tabla acumulada.
      </>
    );

  const legend =
    variant === "express"
      ? "Orden · PG → DIF → H2H · PTS · Victoria 2 · Derrota 0"
      : "Orden · FAV → DIF → H2H → PG · PTS · Victoria 2 · Derrota 0";

  return (
    <aside
      className={`standings-scoring-help ${className}`.trim()}
      aria-label="Cómo se calcula la clasificación"
    >
      <p className="standings-scoring-help__title">¿Cómo se ordena la tabla?</p>
      <p className="standings-scoring-help__text">{helpText}</p>
      <p className="standings-scoring-help__legend">{legend}</p>
    </aside>
  );
};
