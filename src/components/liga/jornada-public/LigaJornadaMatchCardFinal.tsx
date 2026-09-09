import React from "react";
import type { PartidoPublicScoreboard } from "../../../lib/liga/publicDisplay";
import { LigaJornadaMatchCardHeader } from "./LigaJornadaMatchCardHeader";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";
import { LigaJornadaMatchPairStack } from "./LigaJornadaMatchPairStack";
import { LigaJornadaMatchScoreGrid } from "./LigaJornadaMatchScoreGrid";

interface LigaJornadaMatchCardFinalProps {
  canchaNum: string | number;
  estadoMod: "pending" | "live" | "done";
  estadoText: string;
  side1: LigaJornadaMatchPairSide;
  side2: LigaJornadaMatchPairSide;
  board: PartidoPublicScoreboard;
  p1Wins: boolean;
  p2Wins: boolean;
  matchStyle?: React.CSSProperties;
}

/** Invierte p1/p2 del marcador para alinear con ganador arriba. */
function boardWithTopFirst(
  board: PartidoPublicScoreboard,
  flip: boolean
): PartidoPublicScoreboard {
  if (!flip) return board;
  if (board.kind === "simple") {
    return { ...board, s1: board.s2, s2: board.s1 };
  }
  if (board.kind === "board") {
    return {
      ...board,
      columns: board.columns.map((col) => ({
        ...col,
        p1: col.p2,
        p2: col.p1,
      })),
    };
  }
  return board;
}

/** Card final — layout vertical (ganador arriba) + marcador debajo. */
export const LigaJornadaMatchCardFinal: React.FC<
  LigaJornadaMatchCardFinalProps
> = ({
  canchaNum,
  estadoMod,
  estadoText,
  side1,
  side2,
  board,
  p1Wins,
  p2Wins,
  matchStyle,
}) => {
  const winnerOnTop = p2Wins;
  const topSide = winnerOnTop ? side2 : side1;
  const bottomSide = winnerOnTop ? side1 : side2;
  const topTone = p1Wins || p2Wins ? "win" : undefined;
  const bottomTone = p1Wins || p2Wins ? "loss" : undefined;
  const visualBoard = boardWithTopFirst(board, winnerOnTop);

  return (
    <article
      className="liga-pantalla-match liga-pantalla-match--duel liga-jornada-match-card liga-jornada-match-card--final liga-jornada-match-card--hero-players liga-jornada-match-card--broadcast liga-jornada-match-card--split-vs liga-jornada-match-card--stack-vs"
      style={matchStyle}
    >
      <LigaJornadaMatchCardHeader
        canchaNum={canchaNum}
        estadoMod={estadoMod}
        estadoText={estadoText}
      />
      <div className="liga-jornada-match-card__final-body">
        <div className="liga-jornada-match-card__split">
          <LigaJornadaMatchPairStack
            side={topSide}
            align="top"
            tone={topTone}
            label={`Pareja: ${topSide.name1} y ${topSide.name2}`}
          />
          <div className="liga-jornada-match-card__split-vs" aria-hidden="true">
            <span className="liga-jornada-match-card__split-vs-line" />
            <span className="liga-jornada-match-card__split-vs-badge">VS</span>
          </div>
          <LigaJornadaMatchPairStack
            side={bottomSide}
            align="bottom"
            tone={bottomTone}
            label={`Pareja: ${bottomSide.name1} y ${bottomSide.name2}`}
          />
        </div>
        <div className="liga-jornada-match-card__final-score">
          <LigaJornadaMatchScoreGrid board={visualBoard} />
        </div>
      </div>
    </article>
  );
};
