import React from "react";
import { AmericanoPortrait } from "./AmericanoPortrait";
import "./americano-court-board.css";

export interface AmericanoCourtPlayer {
  id: string;
  name: string;
  fotoUrl?: string | null;
}

export const AmericanoPairMark: React.FC<{
  value?: number | null;
  opponent?: number | null;
}> = ({ value, opponent }) => {
  const played = Number.isFinite(value) && Number.isFinite(opponent);
  if (!played || value == null || opponent == null) {
    return <span className="am-court-board__pending">—</span>;
  }
  const tone = value > opponent ? " is-win" : value < opponent ? " is-loss" : "";
  return <span className={`am-court-board__num${tone}`}>{value}</span>;
};

/** Retratos de cada pareja y su marcador debajo. */
export const AmericanoCourtBoard: React.FC<{
  sideA: AmericanoCourtPlayer[];
  sideB: AmericanoCourtPlayer[];
  labelA: string;
  labelB: string;
  scoreA: React.ReactNode;
  scoreB: React.ReactNode;
}> = ({ sideA, sideB, labelA, labelB, scoreA, scoreB }) => (
  <div className="am-court-board" aria-label={`${labelA} contra ${labelB}`}>
    <div className="am-court-board__faces">
      {sideA.map((player) => (
        <AmericanoPortrait
          key={player.id}
          name={player.name}
          fotoUrl={player.fotoUrl}
        />
      ))}
    </div>
    <span className="am-court-board__vs" aria-hidden>
      VS
    </span>
    <div className="am-court-board__faces">
      {sideB.map((player) => (
        <AmericanoPortrait
          key={player.id}
          name={player.name}
          fotoUrl={player.fotoUrl}
        />
      ))}
    </div>
    <div className="am-court-board__score">{scoreA}</div>
    <span className="am-court-board__vs-gap" aria-hidden />
    <div className="am-court-board__score">{scoreB}</div>
  </div>
);
