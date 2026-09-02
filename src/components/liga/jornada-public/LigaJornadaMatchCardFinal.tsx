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

/** Card final — filas jugador con avatar + marcador central + ganador. */
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
  const winnerSide = p1Wins ? side1 : p2Wins ? side2 : null;

  return (
    <article
      className="liga-pantalla-match liga-pantalla-match--duel liga-jornada-match-card liga-jornada-match-card--final liga-jornada-match-card--hero-players"
      style={matchStyle}
    >
      <LigaJornadaMatchCardHeader
        canchaNum={canchaNum}
        estadoMod={estadoMod}
        estadoText={estadoText}
      />
      <div className="liga-pantalla-match__duel liga-jornada-match-card__final-duel">
        <div
          className={`liga-pantalla-match__side${
            p1Wins
              ? " liga-pantalla-match__side--win"
              : p2Wins
                ? " liga-pantalla-match__side--loss"
                : ""
          }`}
        >
          <LigaJornadaMatchPairStack
            side={side1}
            align="left"
            label={`Pareja: ${side1.name1} y ${side1.name2}`}
          />
        </div>
        <div className="liga-jornada-match-card__final-score">
          <LigaJornadaMatchScoreGrid board={board} />
        </div>
        <div
          className={`liga-pantalla-match__side${
            p2Wins
              ? " liga-pantalla-match__side--win"
              : p1Wins
                ? " liga-pantalla-match__side--loss"
                : ""
          }`}
        >
          <LigaJornadaMatchPairStack
            side={side2}
            align="right"
            label={`Pareja: ${side2.name1} y ${side2.name2}`}
          />
        </div>
      </div>
      {winnerSide ? (
        <div className="liga-jornada-match-card__final-winner">
          <span className="liga-jornada-match-card__final-winner-label">
            Ganadores
          </span>
          <div className="liga-jornada-match-card__final-winner-players">
            <LigaJornadaMatchPairStack
              side={winnerSide}
              align="left"
              label={`Ganadores: ${winnerSide.name1} y ${winnerSide.name2}`}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
};
