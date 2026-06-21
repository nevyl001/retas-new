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

export type PublicRetaRunnerUp = {
  place: 2 | 3;
  title: string;
  avatars: PublicRetaWinnerAvatar[];
};

export const PublicRetaWinnerSection: React.FC<{
  title: string;
  subtitle?: string;
  torneoNombre?: string;
  fraseMotivacional?: string;
  participantesNote?: string;
  stats?: { value: string | number; label: string }[];
  winners?: PublicRetaWinnerAvatar[];
  runnersUp?: PublicRetaRunnerUp[];
}> = ({
  title,
  subtitle,
  torneoNombre,
  fraseMotivacional = DEFAULT_MOTIVATIONAL,
  participantesNote,
  stats,
  winners,
  runnersUp,
}) => {
  const hasWinners = Boolean(winners && winners.length > 0);
  const hasRunnersUp = Boolean(runnersUp && runnersUp.length > 0);

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
          <div
            className="ro-pub-celebrate__heroes"
            aria-label={title.replace(/\s*\/\s*/g, ", ")}
          >
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
        ) : (
          <p className="ro-pub-celebrate__names">{title.replace(/\s*\/\s*/g, " · ")}</p>
        )}
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

        {participantesNote ? (
          <p className="ro-pub-celebrate__participantes-note">{participantesNote}</p>
        ) : null}

        {hasRunnersUp ? (
          <div className="ro-pub-celebrate__podium-sub" aria-label="Subcampeones">
            {runnersUp!.map((entry) => (
              <div
                key={entry.place}
                className={`ro-pub-celebrate__podium-sub-item ro-pub-celebrate__podium-sub-item--${entry.place}`}
              >
                <p className="ro-pub-celebrate__podium-sub-rank">
                  {entry.place === 2 ? "2.º lugar" : "3.er lugar"}
                </p>
                {entry.avatars.length > 0 ? (
                  <div className="ro-pub-celebrate__heroes ro-pub-celebrate__heroes--sub">
                    {entry.avatars.map((w) => (
                      <div key={w.name} className="ro-pub-celebrate__hero ro-pub-celebrate__hero--sub">
                        <div className="ro-pub-celebrate__hero-ring ro-pub-celebrate__hero-ring--sub">
                          <JugadorAvatar
                            fotoUrl={w.fotoUrl}
                            nombre={w.name}
                            size="lg"
                            className="ro-pub-celebrate__hero-avatar ro-pub-celebrate__hero-avatar--sub"
                          />
                        </div>
                        <span className="ro-pub-celebrate__hero-name ro-pub-celebrate__hero-name--sub">
                          {w.name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ro-pub-celebrate__names ro-pub-celebrate__names--sub">
                    {entry.title.replace(/\s*\/\s*/g, " · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};
