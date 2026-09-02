import React from "react";
import type { PartidoPublicScoreboard } from "../../../lib/liga/publicDisplay";
import { LigaJornadaMatchCardHeader } from "./LigaJornadaMatchCardHeader";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";
import { LigaJornadaMatchPairLine } from "./LigaJornadaMatchPairLine";
import { LigaJornadaMatchScoreGrid } from "./LigaJornadaMatchScoreGrid";
import { formatPairCompactLine } from "./ligaJornadaMatchNames";

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

/** Card final — nombres arriba, marcador protagonista, ganador al pie. */
export const LigaJornadaMatchCardFinal: React.FC<LigaJornadaMatchCardFinalProps> = ({
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
  const winnerLabel = p1Wins
    ? formatPairCompactLine(side1.name1, side1.name2)
    : p2Wins
      ? formatPairCompactLine(side2.name1, side2.name2)
      : null;

  return (
    <article
      className="liga-pantalla-match liga-jornada-match-card liga-jornada-match-card--final"
      style={matchStyle}
    >
      <LigaJornadaMatchCardHeader
        canchaNum={canchaNum}
        estadoMod={estadoMod}
        estadoText={estadoText}
      />
      <div className="liga-jornada-match-card__final-body">
        <div className="liga-jornada-match-card__final-pairs">
          <LigaJornadaMatchPairLine
            side={side1}
            win={p1Wins}
            loss={p2Wins}
            align="left"
          />
          <LigaJornadaMatchPairLine
            side={side2}
            win={p2Wins}
            loss={p1Wins}
            align="right"
          />
        </div>
        <LigaJornadaMatchScoreGrid board={board} />
        {winnerLabel ? (
          <div className="liga-jornada-match-card__final-winner">
            <span className="liga-jornada-match-card__final-winner-label">
              Ganador
            </span>
            <span className="liga-jornada-match-card__final-winner-names">
              {winnerLabel}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
};
