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
  /** Torneo Express: DIF → FAV → PG → H2H */
  variant?: "default" | "express";
  /** Tipo de reta/torneo para el párrafo contextual (evita mencionar americano en dual meet, etc.). */
  mode?: StandingsHelpMode;
}

function buildHelpCopy(
  variant: "default" | "express",
  mode: StandingsHelpMode
): { lead: React.ReactNode; order: React.ReactNode } {
  const isExpress = variant === "express" || mode === "express";
  if (isExpress) {
    return {
      lead: (
        <>
          Gana quien tenga mejor <strong>diferencia (DIF)</strong>.
        </>
      ),
      order: (
        <>
          Orden: <strong>DIF</strong> → <strong>FAV</strong> → <strong>PG</strong> →
          H2H · <strong>PTS</strong> = referencia
        </>
      ),
    };
  }
  if (mode === "dual-meet") {
    return {
      lead: (
        <>
          Gana el equipo con más <strong>games acumulados (FAV)</strong>.
        </>
      ),
      order: (
        <>
          Orden: <strong>FAV</strong> → <strong>CON</strong> (menos) →{" "}
          <strong>PG</strong> · <strong>PTS</strong> referencia
        </>
      ),
    };
  }
  return {
    lead: (
      <>
        Gana la pareja con más <strong>games acumulados (FAV)</strong>.
      </>
    ),
    order: (
      <>
        Luego <strong>DIF</strong> (diferencia) y por último <strong>PG</strong>{" "}
        (partidos ganados). Orden: <strong>FAV</strong> → <strong>DIF</strong> →{" "}
        <strong>PG</strong>
      </>
    ),
  };
}

function buildCompactLine(
  variant: "default" | "express",
  mode: StandingsHelpMode
): React.ReactNode {
  const isExpress = variant === "express" || mode === "express";
  if (isExpress) {
    return (
      <>
        Orden: <strong>DIF</strong> → <strong>FAV</strong> → <strong>PG</strong> →
        H2H · <strong>PTS</strong> = referencia
      </>
    );
  }
  if (mode === "dual-meet") {
    return (
      <>
        Gana con más <strong>FAV</strong> · Orden: <strong>FAV</strong> →{" "}
        <strong>CON</strong> → <strong>PG</strong>
      </>
    );
  }
  return (
    <>
      Gana con más <strong>FAV</strong> (games) · Orden: <strong>FAV</strong> →{" "}
      <strong>DIF</strong> → <strong>PG</strong>
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

  const schedulingHint = getStandingsCompactSchedulingHint(mode);

  if (compact) {
    return (
      <p
        className={`standings-scoring-help standings-scoring-help--compact ${className}`.trim()}
        aria-label="Cómo se calcula la clasificación"
      >
        {buildCompactLine(variant, mode)}
        {schedulingHint ? <> · {schedulingHint}</> : null}
      </p>
    );
  }

  const { lead, order } = buildHelpCopy(variant, mode);

  return (
    <aside
      className={`standings-scoring-help standings-scoring-help--brief ${className}`.trim()}
      aria-label="Cómo se calcula la clasificación"
    >
      <p className="standings-scoring-help__lead">{lead}</p>
      <p className="standings-scoring-help__text">{order}</p>
    </aside>
  );
};
