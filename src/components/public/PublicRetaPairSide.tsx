import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorRatingChip } from "../jugadores/JugadorRatingChip";
import { TeamBadge } from "../teams/TeamBadge";
import "../jugadores/riviera-jugadores.css";

export type PublicRetaPairPlayer = {
  id: string;
  name: string;
  fotoUrl?: string | null;
  rating?: number | null;
};

export const PublicRetaPairSide: React.FC<{
  players: PublicRetaPairPlayer[];
  label: string;
  align?: "left" | "right";
  isWinner?: boolean;
  isTie?: boolean;
  teamLabel?: string | null;
  teamIndex?: number | null;
  /**
   * band = pareja compacta en fila (clara para faceoff público).
   * showcase = avatares grandes lado a lado (legacy / celebrate).
   */
  variant?: "band" | "showcase";
}> = ({
  players,
  label,
  align = "left",
  isWinner = false,
  isTie = false,
  teamLabel = null,
  teamIndex = null,
  variant = "showcase",
}) => {
  const [p1, p2] = players;
  const hasBothPlayers = Boolean(p1 && p2);
  const rowClass = isTie
    ? " te-pub-pair--tie"
    : isWinner
      ? " te-pub-pair--win"
      : "";

  if (hasBothPlayers && variant === "band") {
    const bandPlayer = (p: PublicRetaPairPlayer) => (
      <div className="te-pub-pair__band-player" key={p.id}>
        <JugadorAvatar
          fotoUrl={p.fotoUrl}
          nombre={p.name}
          size="md"
          className="te-pub-pair__avatar"
        />
        <div className="te-pub-pair__band-player-meta">
          <span className="te-pub-pair__band-name">{p.name}</span>
          <JugadorRatingChip
            rating={p.rating}
            className="te-pub-pair__player-rating"
          />
        </div>
      </div>
    );

    return (
      <div
        className={`te-pub-pair te-pub-pair--band te-pub-pair--${align}${rowClass}`}
        aria-label={label}
      >
        {teamLabel ? (
          <TeamBadge
            name={teamLabel}
            teamIndex={teamIndex ?? undefined}
            className="te-pub-pair__team"
          />
        ) : null}
        <div className="te-pub-pair__band">
          {bandPlayer(p1!)}
          <span className="te-pub-pair__band-join" aria-hidden>
            &
          </span>
          {bandPlayer(p2!)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`te-pub-pair te-pub-pair--${align}${rowClass}`}
      aria-label={label}
    >
      {hasBothPlayers ? (
        <>
          {teamLabel ? (
            <TeamBadge
              name={teamLabel}
              teamIndex={teamIndex ?? undefined}
              className="te-pub-pair__team"
            />
          ) : null}
          <div className="te-pub-pair__showcase" aria-hidden>
            <div className="te-pub-pair__player">
              <JugadorAvatar
                fotoUrl={p1!.fotoUrl}
                nombre={p1!.name}
                size="xl"
                className="te-pub-pair__avatar"
              />
              <span className="te-pub-pair__player-name">{p1!.name}</span>
              <JugadorRatingChip
                rating={p1!.rating}
                className="te-pub-pair__player-rating"
              />
            </div>
            <div className="te-pub-pair__player">
              <JugadorAvatar
                fotoUrl={p2!.fotoUrl}
                nombre={p2!.name}
                size="xl"
                className="te-pub-pair__avatar"
              />
              <span className="te-pub-pair__player-name">{p2!.name}</span>
              <JugadorRatingChip
                rating={p2!.rating}
                className="te-pub-pair__player-rating"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="te-pub-pair__avatars" aria-hidden>
            {p1 ? (
              <JugadorAvatar
                fotoUrl={p1.fotoUrl}
                nombre={p1.name}
                size="xl"
                className="te-pub-pair__avatar"
              />
            ) : null}
            {p2 ? (
              <JugadorAvatar
                fotoUrl={p2.fotoUrl}
                nombre={p2.name}
                size="xl"
                className="te-pub-pair__avatar te-pub-pair__avatar--front"
              />
            ) : null}
          </div>
          <p className="te-pub-pair__label">{label}</p>
        </>
      )}
    </div>
  );
};
