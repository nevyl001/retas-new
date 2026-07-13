import React from "react";

/** Leyenda compacta para la vista pública de clasificación. */
export const PublicStandingsScoringHelp: React.FC = () => (
  <aside className="te-pub-scoring-help" aria-label="Cómo se calcula la clasificación">
    <p className="te-pub-scoring-help__text">
      Orden: <strong>PG</strong> → <strong>FAV</strong> → <strong>DIF</strong> → H2H ·{" "}
      <strong>PTS</strong> = referencia
    </p>
  </aside>
);
