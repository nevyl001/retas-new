import React from "react";
import type { PartidoPublicScoreboard } from "../../../lib/liga/publicDisplay";
import { LigaMotionValue } from "../LigaMotionValue";
import { formatSetColumnLabel } from "./ligaJornadaMatchNames";

interface LigaJornadaMatchScoreGridProps {
  board: PartidoPublicScoreboard;
}

function setsWonSummary(
  columns: { p1: number; p2: number; label: string }[]
): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (const col of columns) {
    // STB cuenta como set decisivo (ej. 1-1 + STB → 2-1).
    if (col.p1 > col.p2) p1 += 1;
    else if (col.p2 > col.p1) p2 += 1;
  }
  return { p1, p2 };
}

/** Marcador tipo broadcast: resumen 2-0 + SET 1 / SET 2 con ganador resaltado. */
export const LigaJornadaMatchScoreGrid: React.FC<
  LigaJornadaMatchScoreGridProps
> = ({ board }) => {
  if (board.kind === "wo") {
    return (
      <div className="liga-jornada-match-score liga-jornada-match-score--wo">
        <p className="liga-jornada-match-score__wo" role="status">
          Walkover
        </p>
      </div>
    );
  }

  if (board.kind === "simple") {
    const topWin = board.s1 > board.s2;
    const botWin = board.s2 > board.s1;
    return (
      <div className="liga-jornada-match-score" aria-label="Marcador">
        <div className="liga-jornada-match-score__summary" aria-hidden>
          <span
            className={`liga-jornada-match-score__summary-num${
              topWin ? " is-win" : ""
            }`}
          >
            {board.s1}
          </span>
          <span className="liga-jornada-match-score__summary-sep">–</span>
          <span
            className={`liga-jornada-match-score__summary-num${
              botWin ? " is-win" : ""
            }`}
          >
            {board.s2}
          </span>
        </div>
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
    const summary = setsWonSummary(board.columns);
    const showSummary = board.columns.length > 0;

    return (
      <div className="liga-jornada-match-score" aria-label="Marcador por sets">
        {showSummary ? (
          <div className="liga-jornada-match-score__summary">
            <span
              className={`liga-jornada-match-score__summary-num${
                summary.p1 > summary.p2 ? " is-win" : ""
              }`}
            >
              {summary.p1}
            </span>
            <span className="liga-jornada-match-score__summary-sep">–</span>
            <span
              className={`liga-jornada-match-score__summary-num${
                summary.p2 > summary.p1 ? " is-win" : ""
              }`}
            >
              {summary.p2}
            </span>
          </div>
        ) : null}
        <div
          className="liga-jornada-match-score__grid"
          style={{ ["--score-cols" as string]: board.columns.length }}
        >
          {board.columns.map((col) => (
            <span key={col.label} className="liga-jornada-match-score__head">
              {formatSetColumnLabel(col.label)}
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
