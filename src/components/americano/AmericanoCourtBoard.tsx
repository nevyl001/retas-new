import React from "react";
import { AmericanoPortrait } from "./AmericanoPortrait";
import "./americano-court-board.css";

export interface AmericanoCourtPlayer {
  id: string;
  name: string;
  fotoUrl?: string | null;
}

export const AmericanoCenterScore: React.FC<{
  scoreA?: number | null;
  scoreB?: number | null;
}> = ({ scoreA, scoreB }) => {
  const played = Number.isFinite(scoreA) && Number.isFinite(scoreB);
  if (!played || scoreA == null || scoreB == null) {
    return (
      <span className="am-court-board__pending" aria-label="Sin marcador">
        —
      </span>
    );
  }
  const aWins = scoreA > scoreB;
  const bWins = scoreB > scoreA;
  const tone = (wins: boolean, loses: boolean) =>
    wins ? " is-win" : loses ? " is-loss" : "";
  return (
    <div
      className="am-court-board__result"
      aria-label={`Marcador ${scoreA} a ${scoreB}`}
    >
      <span className={`am-court-board__num${tone(aWins, bWins)}`}>{scoreA}</span>
      <span className="am-court-board__sep" aria-hidden>
        —
      </span>
      <span className={`am-court-board__num${tone(bWins, aWins)}`}>{scoreB}</span>
    </div>
  );
};

/** Pareja A | marcador | Pareja B, en la misma fila. */
export const AmericanoCourtBoard: React.FC<{
  sideA: AmericanoCourtPlayer[];
  sideB: AmericanoCourtPlayer[];
  labelA: string;
  labelB: string;
  score: React.ReactNode;
}> = ({ sideA, sideB, labelA, labelB, score }) => (
  <div className="am-court-board">
    <div className="am-court-board__pair" aria-label={labelA}>
      {sideA.map((player) => (
        <AmericanoPortrait
          key={player.id}
          name={player.name}
          fotoUrl={player.fotoUrl}
        />
      ))}
    </div>
    <div className="am-court-board__score">{score}</div>
    <div className="am-court-board__pair" aria-label={labelB}>
      {sideB.map((player) => (
        <AmericanoPortrait
          key={player.id}
          name={player.name}
          fotoUrl={player.fotoUrl}
        />
      ))}
    </div>
  </div>
);
