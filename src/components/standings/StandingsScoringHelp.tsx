import React from "react";
import {
  getStandingsCompactSchedulingHint,
  getStandingsSchedulingNoteHighlights,
  getStandingsSchedulingNoteText,
  type StandingsHelpMode,
} from "../../lib/standingsHelpMode";
import "../../styles/standings-scoring-help.css";

function renderHighlightedNote(mode: StandingsHelpMode): React.ReactNode {
  const text = getStandingsSchedulingNoteText(mode);
  const highlights = getStandingsSchedulingNoteHighlights(mode);
  if (!highlights.length) return text;

  const pattern = new RegExp(
    `(${highlights.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isHighlight = highlights.some(
      (h) => h.toLowerCase() === part.toLowerCase()
    );
    return isHighlight ? <strong key={index}>{part}</strong> : part;
  });
}

interface StandingsScoringHelpProps {
  className?: string;
  /** Versión de una línea para tablas reducidas (p. ej. resumen americano). */
  compact?: boolean;
  /** Torneo Express: PG → DIF → H2H */
  variant?: "default" | "express";
  /** Tipo de reta/torneo para el párrafo contextual (evita mencionar americano en dual meet, etc.). */
  mode?: StandingsHelpMode;
}

/** Texto breve: estadísticas en cancha vs orden de la tabla. */
export const StandingsScoringHelp: React.FC<StandingsScoringHelpProps> = ({
  className = "",
  compact = false,
  variant = "default",
  mode: modeProp,
}) => {
  const mode: StandingsHelpMode =
    modeProp ?? (variant === "express" ? "express" : "round-robin");

  if (compact) {
    const schedulingHint = getStandingsCompactSchedulingHint(mode);
    const compactText =
      variant === "express" || mode === "express" ? (
        <>
          Orden: más <strong>PG</strong> → <strong>DIF</strong> → H2H ·{" "}
          <strong>PTS</strong> = victoria 2 (solo referencia)
          {schedulingHint ? <> · {schedulingHint}</> : null}
        </>
      ) : (
        <>
          Orden: más <strong>FAV</strong> → <strong>DIF</strong> → H2H →{" "}
          <strong>PG</strong> · <strong>PTS</strong> = victoria 2 (solo referencia)
          {schedulingHint ? <> · {schedulingHint}</> : null}
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

  const criteriaText =
    variant === "express" || mode === "express" ? (
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
        <strong>PTS</strong> (victoria 2, derrota 0) es solo informativo.{" "}
        {renderHighlightedNote(mode)}
      </>
    );

  const legend =
    variant === "express" || mode === "express"
      ? "Orden · PG → DIF → H2H · PTS · Victoria 2 · Derrota 0"
      : "Orden · FAV → DIF → H2H → PG · PTS · Victoria 2 · Derrota 0";

  return (
    <aside
      className={`standings-scoring-help ${className}`.trim()}
      aria-label="Cómo se calcula la clasificación"
    >
      <p className="standings-scoring-help__title">¿Cómo se ordena la tabla?</p>
      <p className="standings-scoring-help__text">{criteriaText}</p>
      <p className="standings-scoring-help__legend">{legend}</p>
    </aside>
  );
};
