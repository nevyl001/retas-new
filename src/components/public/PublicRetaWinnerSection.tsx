import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "../jugadores/riviera-jugadores.css";
import {
  PublicRivieraCelebrateBrand,
  PublicRivieraCelebrateClosing,
} from "./PublicRivieraCelebrateBrand";

const DEFAULT_MOTIVATIONAL = "Dominaron la cancha." as const;

export type PublicRetaWinnerAvatar = {
  name: string;
  fotoUrl?: string | null;
};

export const PublicRetaWinnerSection: React.FC<{
  title: string;
  subtitle?: string;
  torneoNombre?: string;
  fraseMotivacional?: string;
  stats?: { value: string | number; label: string }[];
  winners?: PublicRetaWinnerAvatar[];
}> = ({
  title,
  subtitle,
  torneoNombre,
  fraseMotivacional = DEFAULT_MOTIVATIONAL,
  stats,
  winners,
}) => {
  const hasWinners = Boolean(winners && winners.length > 0);

  return (
    <section
      className="te-public-section ro-pub-celebrate ro-pub-celebrate--winners te-pub-fade-in"
      aria-label="Ganadores Riviera Open"
    >
      <div className="ro-pub-celebrate__glow" aria-hidden />
      <div className="ro-pub-celebrate__inner">
        <PublicRivieraCelebrateBrand showTagline={false} />

        <p className="ro-pub-celebrate__badge">Ganadores</p>
        <h2 className="ro-pub-celebrate__headline">¡Felicidades!</h2>

        {hasWinners ? (
          <div className="ro-pub-celebrate__heroes" aria-hidden>
            {winners!.map((w) => (
              <div key={w.name} className="ro-pub-celebrate__hero">
                <div className="ro-pub-celebrate__hero-ring">
                  <JugadorAvatar
                    fotoUrl={w.fotoUrl}
                    nombre={w.name}
                    size="xl"
                    className="ro-pub-celebrate__hero-avatar"
                  />
                </div>
                <span className="ro-pub-celebrate__hero-name">{w.name}</span>
              </div>
            ))}
          </div>
        ) : null}

        <p className="ro-pub-celebrate__names">
          {hasWinners ? title.replace(/\s*\/\s*/g, " · ") : title}
        </p>
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
};
