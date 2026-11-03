import React from "react";

/** VS editorial centrado entre las dos parejas (eje del enfrentamiento). */
export const LigaJornadaMatchVsDivider: React.FC = () => (
  <div className="liga-jornada-match-card__duel-vs" aria-hidden="true">
    <span className="liga-jornada-match-card__duel-vs-rule" />
    <span className="liga-jornada-match-card__duel-vs-label">VS</span>
    <span className="liga-jornada-match-card__duel-vs-rule" />
  </div>
);
