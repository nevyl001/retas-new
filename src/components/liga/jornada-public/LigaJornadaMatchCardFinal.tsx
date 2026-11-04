import React from "react";
import type { PartidoPublicScoreboard } from "../../../lib/liga/publicDisplay";
import { LigaJornadaMatchCardHeader } from "./LigaJornadaMatchCardHeader";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";
import { LigaJornadaMatchPairStack } from "./LigaJornadaMatchPairStack";
import { LigaJornadaMatchScoreGrid } from "./LigaJornadaMatchScoreGrid";
import { LigaJornadaMatchVsDivider } from "./LigaJornadaMatchVsDivider";

interface LigaJornadaMatchCardFinalProps {
  canchaNum: string | number;
  estadoMod: "pending" | "live" | "done" | "draw";
  estadoText: string;
  side1: LigaJornadaMatchPairSide;
  side2: LigaJornadaMatchPairSide;
  board: PartidoPublicScoreboard;
  p1Wins: boolean;
  p2Wins: boolean;
  matchStyle?: React.CSSProperties;
  /** Individual rotativo: solo marcador resumen (sin grid PTS). */
  scoreSummaryOnly?: boolean;
}

/**
 * Card final — pareja izq (vertical) · VS · pareja der (vertical) + marcador.
 * Lados fijos (pareja1 izquierda / pareja2 derecha); tono win/loss visual.
 */
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
  scoreSummaryOnly = false,
}) => {
  const isDraw = estadoMod === "draw";
  const leftTone = isDraw
    ? undefined
    : p1Wins
      ? "win"
      : p2Wins
        ? "loss"
        : undefined;
  const rightTone = isDraw
    ? undefined
    : p2Wins
      ? "win"
      : p1Wins
        ? "loss"
        : undefined;

  return (
    <article
      className={`liga-pantalla-match liga-pantalla-match--duel liga-jornada-match-card liga-jornada-match-card--final liga-jornada-match-card--broadcast liga-jornada-match-card--duel-row liga-jornada-match-card--duel-stacks${
        isDraw ? " liga-jornada-match-card--draw" : ""
      }`}
      style={matchStyle}
    >
      <LigaJornadaMatchCardHeader
        canchaNum={canchaNum}
        estadoMod={estadoMod}
        estadoText={estadoText}
      />
      <div className="liga-jornada-match-card__final-body">
        <div className="liga-jornada-match-card__duel">
          <LigaJornadaMatchPairStack
            side={side1}
            align="left"
            tone={leftTone}
            label={`${side1.name1} y ${side1.name2}`}
          />
          <LigaJornadaMatchVsDivider />
          <LigaJornadaMatchPairStack
            side={side2}
            align="right"
            tone={rightTone}
            label={`${side2.name1} y ${side2.name2}`}
          />
        </div>
        <div className="liga-jornada-match-card__final-score">
          <LigaJornadaMatchScoreGrid
            board={board}
            summaryOnly={scoreSummaryOnly}
            isDraw={isDraw}
          />
        </div>
      </div>
    </article>
  );
};
