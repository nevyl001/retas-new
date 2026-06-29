import React from "react";
import {
  getStandingsCompactSchedulingHint,
  type StandingsHelpMode,
} from "../../lib/standingsHelpMode";
import "../../styles/standings-scoring-help.css";

interface StandingsScoringHelpProps {
  className?: string;
  /** Versión de una línea para tablas reducidas (p. ej. resumen americano). */
  compact?: boolean;
  /** Torneo Express: PG → DIF → H2H */
  variant?: "default" | "express";
  /** Tipo de reta/torneo para el párrafo contextual (evita mencionar americano en dual meet, etc.). */
  mode?: StandingsHelpMode;
}

function buildBriefOrderText(
  variant: "default" | "express",
  mode: StandingsHelpMode
): React.ReactNode {
  const isExpress = variant === "express" || mode === "express";
  if (isExpress) {
    return (
      <>
        Orden: <strong>PG</strong> → <strong>DIF</strong> → H2H ·{" "}
        <strong>PTS</strong> = referencia
      </>
    );
  }
  return (
    <>
      Orden: <strong>FAV</strong> → <strong>DIF</strong> → H2H → <strong>PG</strong>{" "}
      · <strong>PTS</strong> = referencia
    </>
  );
}

/** Texto breve: orden de la tabla. */
export const StandingsScoringHelp: React.FC<StandingsScoringHelpProps> = ({
  className = "",
  compact = false,
  variant = "default",
  mode: modeProp,
}) => {
  const mode: StandingsHelpMode =
    modeProp ?? (variant === "express" ? "express" : "round-robin");

  const briefText = buildBriefOrderText(variant, mode);
  const schedulingHint = getStandingsCompactSchedulingHint(mode);

  if (compact) {
    return (
      <p
        className={`standings-scoring-help standings-scoring-help--compact ${className}`.trim()}
        aria-label="Cómo se calcula la clasificación"
      >
        {briefText}
        {schedulingHint ? <> · {schedulingHint}</> : null}
      </p>
    );
  }

  return (
    <aside
      className={`standings-scoring-help standings-scoring-help--brief ${className}`.trim()}
      aria-label="Cómo se calcula la clasificación"
    >
      <p className="standings-scoring-help__text">{briefText}</p>
    </aside>
  );
};
