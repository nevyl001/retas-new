import React from "react";

const COLUMN_LEGEND = [
  ["PJ", "Partidos jugados"],
  ["PG", "Partidos ganados"],
  ["PP", "Partidos perdidos"],
  ["FAV", "Games a favor"],
  ["CON", "Games en contra"],
  ["DIF", "FAV − CON"],
  ["PTS", "Puntos tabla (2 / 0)"],
] as const;

/** Leyenda compacta para la vista pública de clasificación. */
export const PublicStandingsScoringHelp: React.FC = () => (
  <aside className="te-pub-scoring-help" aria-label="Cómo se calcula la clasificación">
    <p className="te-pub-scoring-help__title">¿Cómo se ordena la tabla?</p>
    <p className="te-pub-scoring-help__text">
      Primero quien hizo más games (<strong>FAV</strong>), aunque la diferencia sea
      negativa. Si empatan en FAV, gana mayor <strong>DIF</strong> (FAV − CON); luego
      enfrentamiento directo y, al final, más <strong>PG</strong>.{" "}
      <strong>PTS</strong> (2 por victoria, 0 por derrota) es solo informativo.
    </p>
    <ul className="te-pub-scoring-help__legend">
      {COLUMN_LEGEND.map(([abbr, label]) => (
        <li key={abbr} className="te-pub-scoring-help__legend-item">
          <span className="te-pub-scoring-help__abbr">{abbr}</span>
          <span className="te-pub-scoring-help__label">{label}</span>
        </li>
      ))}
    </ul>
  </aside>
);
