import React, { useEffect, useRef, useState } from "react";
import { getWinnersSectionAriaLabel, useBranding } from "../../club-experience";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorRatingChip } from "../jugadores/JugadorRatingChip";
import "../jugadores/riviera-jugadores.css";
import type { TeamWinnerCelebrateStatCard } from "../../lib/teamWinnerCelebrate";
import {
  isPhotographicSplitVsFoto,
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "../liga/jornada-public/ligaJornadaMatchNames";
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
  rating?: number | null;
};

export type PublicRetaRunnerUp = {
  place: 2 | 3;
  title: string;
  avatars: PublicRetaWinnerAvatar[];
};

/** Retrato rectangular tipo card de partido (equipos / share). */
function CelebrateTeamPortrait({ player }: { player: PublicRetaWinnerAvatar }) {
  const { primary, secondary } = splitPlayerDisplayName(player.name);
  const tone = playerAvatarHashTone(player.name);
  const initials = `${primary.charAt(0)}${
    secondary?.charAt(0) ?? primary.charAt(1) ?? ""
  }`.toUpperCase();
  const candidate =
    isPhotographicSplitVsFoto(player.fotoUrl) && player.fotoUrl
      ? player.fotoUrl.trim()
      : null;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const showPhoto = Boolean(candidate) && !failed && loaded;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [candidate]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !candidate) return;
    if (img.complete) {
      if (img.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, [candidate]);

  return (
    <div
      className={`ro-pub-celebrate__portrait${
        showPhoto
          ? " ro-pub-celebrate__portrait--photo"
          : " ro-pub-celebrate__portrait--fallback"
      }`}
      style={
        showPhoto
          ? undefined
          : ({
              ["--celebrate-portrait-bg" as string]: tone.background,
              ["--celebrate-portrait-fg" as string]: tone.color,
            } as React.CSSProperties)
      }
      aria-label={player.name}
    >
      {!showPhoto ? (
        <span className="ro-pub-celebrate__portrait-initials" aria-hidden>
          {initials}
        </span>
      ) : null}
      {candidate && !failed ? (
        <img
          ref={imgRef}
          className={`ro-pub-celebrate__portrait-photo${loaded ? " is-visible" : ""}`}
          src={candidate}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="ro-pub-celebrate__portrait-scrim" aria-hidden />
      <span className="ro-pub-celebrate__portrait-identity">
        <span className="ro-pub-celebrate__portrait-given">{primary}</span>
        {secondary ? (
          <span className="ro-pub-celebrate__portrait-family">{secondary}</span>
        ) : null}
        <JugadorRatingChip
          rating={player.rating}
          className="ro-pub-celebrate__portrait-rating"
        />
      </span>
    </div>
  );
}

export const PublicRetaWinnerSection: React.FC<{
  id?: string;
  title: string;
  subtitle?: string;
  torneoNombre?: string;
  formatKicker?: string;
  badge?: string;
  headline?: string;
  fraseMotivacional?: string;
  participantesNote?: string;
  stats?: TeamWinnerCelebrateStatCard[];
  winners?: PublicRetaWinnerAvatar[];
  runnersUp?: PublicRetaRunnerUp[];
  /** Tarjeta lista para compartir: stats + redes Riviera Open */
  shareable?: boolean;
  className?: string;
}> = ({
  id,
  title,
  subtitle,
  torneoNombre,
  formatKicker,
  badge = "Ganadores",
  headline = "¡Felicidades!",
  fraseMotivacional = DEFAULT_MOTIVATIONAL,
  participantesNote,
  stats,
  winners,
  runnersUp,
  shareable = false,
  className,
}) => {
  const { nombre: organizerName } = useBranding();
  const hasWinners = Boolean(winners && winners.length > 0);
  const hasRunnersUp = Boolean(runnersUp && runnersUp.length > 0);
  const hasStats = Boolean(stats && stats.length > 0);
  const isTeamShareCard = Boolean(shareable);
  const isBestPairCard = Boolean(
    className?.split(/\s+/).includes("ro-pub-celebrate--best-pair")
  );
  const usePortraitHeroes = isTeamShareCard || isBestPairCard;
  const teamTitle = title.replace(/\s*\/\s*/g, " · ");

  return (
    <section
      id={id}
      className={[
        "te-public-section",
        "ro-pub-celebrate",
        "ro-pub-celebrate--winners",
        "te-pub-fade-in",
        isTeamShareCard ? "ro-pub-celebrate--team-share" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={getWinnersSectionAriaLabel(organizerName)}
    >
      <div className="ro-pub-celebrate__glow" aria-hidden />
      <div className="ro-pub-celebrate__inner">
        <PublicRivieraCelebrateBrand
          showTagline={false}
          showClubIdentity={!shareable}
        />

        <p className="ro-pub-celebrate__badge">{badge}</p>
        <h2 className="ro-pub-celebrate__headline">{headline}</h2>

        {isTeamShareCard ? (
          <p className="ro-pub-celebrate__names ro-pub-celebrate__names--team">
            {teamTitle}
          </p>
        ) : null}

        {hasWinners ? (
          <div
            className={[
              "ro-pub-celebrate__heroes",
              isTeamShareCard ? "ro-pub-celebrate__heroes--team" : "",
              isBestPairCard ? "ro-pub-celebrate__heroes--pair" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`Jugadores de ${teamTitle}`}
          >
            {winners!.map((w) =>
              usePortraitHeroes ? (
                <CelebrateTeamPortrait
                  key={w.jugadorId || w.name}
                  player={w}
                />
              ) : (
                <div key={w.jugadorId || w.name} className="ro-pub-celebrate__hero">
                  <div className="ro-pub-celebrate__hero-ring">
                    <JugadorAvatar
                      fotoUrl={w.fotoUrl}
                      nombre={w.name}
                      size="xl"
                      className="ro-pub-celebrate__hero-avatar"
                    />
                  </div>
                  <span className="ro-pub-celebrate__hero-name">{w.name}</span>
                  <JugadorRatingChip
                    rating={w.rating}
                    className="ro-pub-celebrate__hero-rating"
                  />
                </div>
              )
            )}
          </div>
        ) : !isTeamShareCard ? (
          <p className="ro-pub-celebrate__names">{teamTitle}</p>
        ) : null}

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
                        <JugadorRatingChip
                          rating={w.rating}
                          className="ro-pub-celebrate__hero-rating ro-pub-celebrate__hero-rating--sub"
                        />
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
