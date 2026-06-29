import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorRatingChip } from "../jugadores/JugadorRatingChip";
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
}> = ({ players, label, align = "left", isWinner = false, isTie = false }) => {
  const [p1, p2] = players;
  const hasBothPlayers = Boolean(p1 && p2);
  const rowClass = isTie
    ? " te-pub-pair--tie"
    : isWinner
      ? " te-pub-pair--win"
      : "";

  return (
    <div
      className={`te-pub-pair te-pub-pair--${align}${rowClass}`}
      aria-label={label}
    >
      {hasBothPlayers ? (
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
