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
  const displayLabel =
    p1 && p2 ? `${p1.name} · ${p2.name}` : label;

  return (
    <div
      className={`te-pub-pair te-pub-pair--${align}${
        isWinner ? " te-pub-pair--win" : ""
      }`}
      aria-label={label}
    >
      <div className="te-pub-pair__avatars" aria-hidden>
        {p1 ? (
          <JugadorAvatar
            fotoUrl={p1.fotoUrl}
            nombre={p1.name}
            size="lg"
            className="te-pub-pair__avatar te-pub-pair__avatar--back"
          />
        ) : null}
        {p2 ? (
          <JugadorAvatar
            fotoUrl={p2.fotoUrl}
            nombre={p2.name}
            size="lg"
            className="te-pub-pair__avatar te-pub-pair__avatar--front"
          />
        ) : null}
      </div>
      <p className="te-pub-pair__label">{displayLabel}</p>
    </div>
  );
};
