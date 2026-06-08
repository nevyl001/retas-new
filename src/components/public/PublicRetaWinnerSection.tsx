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
      {winners && winners.length > 0 ? (
        <div className="ro-pub-celebrate__avatars" aria-hidden>
          {winners.map((w) => (
            <JugadorAvatar
              key={w.name}
              fotoUrl={w.fotoUrl}
              nombre={w.name}
              size="lg"
              className="ro-pub-celebrate__avatar"
            />
          ))}
        </div>
      ) : null}
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
