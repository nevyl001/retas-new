import React from "react";
import { getWinnersSectionAriaLabel, useBranding } from "../../club-experience";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "../jugadores/riviera-jugadores.css";
import type { TeamWinnerCelebrateStatCard } from "../../lib/teamWinnerCelebrate";
import {
  PublicRivieraCelebrateBrand,
  PublicRivieraCelebrateClosing,
} from "./PublicRivieraCelebrateBrand";
import { PublicRivieraSocialBar } from "./PublicRivieraSocialBar";

const DEFAULT_MOTIVATIONAL = "Dominaron la cancha." as const;

export type PublicRetaWinnerAvatar = {
  name: string;
  fotoUrl?: string | null;
  jugadorId?: string | null;
};

export type PublicRetaRunnerUp = {
  place: 2 | 3;
  title: string;
  avatars: PublicRetaWinnerAvatar[];
};

export const PublicRetaWinnerSection: React.FC<{
  id?: string;
  title: string;
  subtitle?: string;
  torneoNombre?: string;
  formatKicker?: string;
  fraseMotivacional?: string;
  participantesNote?: string;
  stats?: TeamWinnerCelebrateStatCard[];
  winners?: PublicRetaWinnerAvatar[];
  runnersUp?: PublicRetaRunnerUp[];
  /** Tarjeta lista para compartir: stats + redes Riviera Open */
  shareable?: boolean;
}> = ({
  id,
  title,
  subtitle,
  torneoNombre,
  formatKicker,
  fraseMotivacional = DEFAULT_MOTIVATIONAL,
  participantesNote,
  stats,
  winners,
  runnersUp,
  shareable = false,
}) => {
  const { nombre: organizerName } = useBranding();
  const hasWinners = Boolean(winners && winners.length > 0);
  const hasRunnersUp = Boolean(runnersUp && runnersUp.length > 0);
  const hasStats = Boolean(stats && stats.length > 0);
  const isTeamShareCard = shareable && !hasWinners;

  return (
    <section
      id={id}
      className={[
        "te-public-section",
        "ro-pub-celebrate",
        "ro-pub-celebrate--winners",
        "te-pub-fade-in",
        isTeamShareCard ? "ro-pub-celebrate--team-share" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={getWinnersSectionAriaLabel(organizerName)}
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
          <p
            className={[
              "ro-pub-celebrate__names",
              isTeamShareCard ? "ro-pub-celebrate__names--team" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {title.replace(/\s*\/\s*/g, " · ")}
          </p>
        )}

        <p className="ro-pub-celebrate__motivational">{fraseMotivacional}</p>
        {subtitle ? <p className="ro-pub-celebrate__rank">{subtitle}</p> : null}

        {hasStats ? (
          <div
            className="ro-pub-celebrate__stats ro-pub-celebrate__stats--team"
            role="list"
            aria-label="Estadísticas del equipo ganador"
          >
            {stats!.map((s) => (
              <div
                key={s.label}
                className={[
                  "ro-pub-celebrate__stat",
                  s.highlight ? "ro-pub-celebrate__stat--highlight" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="listitem"
              >
                <span className="ro-pub-celebrate__stat-value">{s.value}</span>
                <span className="ro-pub-celebrate__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {formatKicker ? (
          <p className="ro-pub-celebrate__format-kicker">{formatKicker}</p>
        ) : null}

        <PublicRivieraCelebrateClosing torneoNombre={torneoNombre} />

        {shareable ? (
          <PublicRivieraSocialBar compact className="ro-pub-celebrate__social" />
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
