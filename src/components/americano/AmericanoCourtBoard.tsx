import React from "react";
import { AmericanoPortrait } from "./AmericanoPortrait";
import "./americano-court-board.css";

export interface AmericanoCourtPlayer {
  id: string;
  name: string;
  fotoUrl?: string | null;
  rating?: number | null;
}

export const AmericanoPairMark: React.FC<{
  value?: number | null;
  opponent?: number | null;
}> = ({ value, opponent }) => {
  const played = Number.isFinite(value) && Number.isFinite(opponent);
  if (!played || value == null || opponent == null) {
    return <span className="am-court-board__pending">—</span>;
  }
  const isWin = value > opponent;
  const isLoss = value < opponent;
  const isTie = value === opponent;
  const tone = isWin ? " is-win" : isLoss ? " is-loss" : isTie ? " is-tie" : "";
  return (
    <span
      className={`am-court-board__mark${tone}`}
      aria-label={
        isWin
          ? `Ganador ${value}`
          : isTie
            ? `Empate ${value}`
            : String(value)
      }
    >
      {isWin ? (
        <span className="am-court-board__crown" aria-hidden>
          ♛
        </span>
      ) : null}
      {isTie ? (
        <span className="am-court-board__tie-badge" aria-hidden>
          Empate
        </span>
      ) : null}
      <span className={`am-court-board__num${tone}`}>{value}</span>
    </span>
  );
};

/** Pareja A | VS | Pareja B, con el marcador debajo de cada pareja. */
export const AmericanoCourtBoard: React.FC<{
  sideA: AmericanoCourtPlayer[];
  sideB: AmericanoCourtPlayer[];
  labelA: string;
  labelB: string;
  scoreA: React.ReactNode;
  scoreB: React.ReactNode;
}> = ({ sideA, sideB, labelA, labelB, scoreA, scoreB }) => (
  <div className="am-court-board">
    <div className="am-court-board__pair" aria-label={labelA}>
      {sideA.map((player) => (
        <AmericanoPortrait
          key={player.id}
          name={player.name}
          fotoUrl={player.fotoUrl}
          rating={player.rating}
        />
      ))}
      <div className="am-court-board__score">{scoreA}</div>
    </div>
    <div className="am-court-board__vs" aria-hidden>
      <span className="am-court-board__vs-line" />
      <span className="am-court-board__vs-badge">VS</span>
      <span className="am-court-board__vs-line" />
    </div>
    <div className="am-court-board__pair" aria-label={labelB}>
      {sideB.map((player) => (
        <AmericanoPortrait
          key={player.id}
          name={player.name}
          fotoUrl={player.fotoUrl}
          rating={player.rating}
        />
      ))}
      <div className="am-court-board__score">{scoreB}</div>
    </div>
  </div>
);
