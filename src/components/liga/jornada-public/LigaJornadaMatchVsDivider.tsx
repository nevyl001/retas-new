import React from "react";

/** Separador editorial vertical entre Pareja A y Pareja B. */
export const LigaJornadaMatchVsDivider: React.FC = () => (
  <div className="liga-jornada-match-card__split-vs" aria-hidden="true">
    <span className="liga-jornada-match-card__split-vs-rule" />
    <span className="liga-jornada-match-card__split-vs-label">VS</span>
    <span className="liga-jornada-match-card__split-vs-rule" />
  </div>
);
