import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "../jugadores/riviera-jugadores.css";

export type PublicRetaPairPlayer = {
  id: string;
  name: string;
  fotoUrl?: string | null;
};

export const PublicRetaPairSide: React.FC<{
  players: PublicRetaPairPlayer[];
  label: string;
  align?: "left" | "right";
  isWinner?: boolean;
}> = ({ players, label, align = "left", isWinner = false }) => {
  const [p1, p2] = players;
  const hasBothPlayers = Boolean(p1 && p2);

  return (
    <div
      className={`te-pub-pair te-pub-pair--${align}${
        isWinner ? " te-pub-pair--win" : ""
      }`}
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
          </div>
          <div className="te-pub-pair__player">
            <JugadorAvatar
              fotoUrl={p2!.fotoUrl}
              nombre={p2!.name}
              size="xl"
              className="te-pub-pair__avatar"
            />
            <span className="te-pub-pair__player-name">{p2!.name}</span>
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
