import React from "react";
import {
  PublicRivieraCelebrateBrand,
  PublicRivieraCelebrateClosing,
} from "./PublicRivieraCelebrateBrand";

const DEFAULT_MOTIVATIONAL = "Dominaron la cancha." as const;

export const PublicRetaWinnerSection: React.FC<{
  title: string;
  subtitle?: string;
  torneoNombre?: string;
  fraseMotivacional?: string;
  stats?: { value: string | number; label: string }[];
}> = ({
  title,
  subtitle,
  torneoNombre,
  fraseMotivacional = DEFAULT_MOTIVATIONAL,
  stats,
}) => (
  <section
    className="te-public-section ro-pub-celebrate te-pub-fade-in"
    aria-label="Ganadores Riviera Open"
  >
    <div className="ro-pub-celebrate__inner">
      <PublicRivieraCelebrateBrand />
      <div className="ro-divider-gold" aria-hidden />
      <h2 className="ro-pub-celebrate__headline">¡Felicidades!</h2>
      <p className="ro-pub-celebrate__riviera-line">Riviera Open</p>
      <p className="ro-pub-celebrate__names">{title}</p>
      <p className="ro-pub-celebrate__motivational">{fraseMotivacional}</p>
      {subtitle ? <p className="ro-pub-celebrate__rank">{subtitle}</p> : null}
      <PublicRivieraCelebrateClosing torneoNombre={torneoNombre} />
      {stats && stats.length > 0 ? (
        <div className="ro-pub-celebrate__stats" role="list">
          {stats.map((s) => (
            <div key={s.label} className="ro-pub-celebrate__stat" role="listitem">
              <span className="ro-pub-celebrate__stat-value">{s.value}</span>
              <span className="ro-pub-celebrate__stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  </section>
);
