import React from "react";
import type { PartidoPublicScoreboard } from "../../../lib/liga/publicDisplay";
import { LigaMotionValue } from "../LigaMotionValue";

interface LigaJornadaMatchScoreGridProps {
  board: PartidoPublicScoreboard;
}

/** Marcador premium centrado — protagonista de la card final. */
export const LigaJornadaMatchScoreGrid: React.FC<LigaJornadaMatchScoreGridProps> = ({
  board,
}) => {
  if (board.kind === "wo") {
    return (
      <p className="liga-jornada-match-score__wo" role="status">
        Walkover
      </p>
    );
  }

  if (board.kind === "simple") {
    const topWin = board.s1 > board.s2;
    const botWin = board.s2 > board.s1;
    return (
      <div className="liga-jornada-match-score" aria-label="Marcador">
        <div
          className="liga-jornada-match-score__grid liga-jornada-match-score__grid--simple"
          style={{ ["--score-cols" as string]: 1 }}
        >
          <span className="liga-jornada-match-score__head">PTS</span>
          <span
            className={`liga-jornada-match-score__cell${
              topWin ? " liga-jornada-match-score__cell--win" : ""
            }`}
          >
            <LigaMotionValue morphKey={board.s1} value={board.s1} />
          </span>
          <span
            className={`liga-jornada-match-score__cell${
              botWin ? " liga-jornada-match-score__cell--win" : ""
            }`}
          >
            <LigaMotionValue morphKey={board.s2} value={board.s2} />
          </span>
        </div>
      </div>
    );
  }

  if (board.kind === "board") {
    return (
      <div className="liga-jornada-match-score" aria-label="Marcador por sets">
        <div
          className="liga-jornada-match-score__grid"
          style={{ ["--score-cols" as string]: board.columns.length }}
        >
          {board.columns.map((col) => (
            <span key={col.label} className="liga-jornada-match-score__head">
              {col.label}
            </span>
          ))}
          {board.columns.map((col) => {
            const win = col.p1 > col.p2;
            return (
              <span
                key={`p1-${col.label}`}
                className={`liga-jornada-match-score__cell${
                  win ? " liga-jornada-match-score__cell--win" : ""
                }`}
              >
                <LigaMotionValue morphKey={col.p1} value={col.p1} />
              </span>
            );
          })}
          {board.columns.map((col) => {
            const win = col.p2 > col.p1;
            return (
              <span
                key={`p2-${col.label}`}
                className={`liga-jornada-match-score__cell${
                  win ? " liga-jornada-match-score__cell--win" : ""
                }`}
              >
                <LigaMotionValue morphKey={col.p2} value={col.p2} />
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};
