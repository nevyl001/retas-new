import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "./americano-match-lineup.css";

export interface AmericanoPairLinePlayer {
  id: string;
  name: string;
  fotoUrl?: string | null;
}

/** Fila de pareja: avatar circular y nombre completo, sin foto de fondo. */
export const AmericanoPairLine: React.FC<{
  players: AmericanoPairLinePlayer[];
  highlight?: "win" | "loss" | "tie";
  label: string;
}> = ({ players, highlight, label }) => (
  <div
    className={[
      "am-pair-line",
      highlight ? `am-pair-line--${highlight}` : "",
    ]
      .filter(Boolean)
      .join(" ")}
    aria-label={label}
  >
    {players.map((player) => (
      <div key={player.id} className="am-pair-line__player">
        <JugadorAvatar
          fotoUrl={player.fotoUrl}
          nombre={player.name}
          size="sm"
          className="am-pair-line__avatar"
        />
        <span className="am-pair-line__name" title={player.name}>
          {player.name}
        </span>
      </div>
    ))}
  </div>
);
