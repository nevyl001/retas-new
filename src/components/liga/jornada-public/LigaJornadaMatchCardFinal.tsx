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

/** Card final — mismo duelo que pending + marcador abajo. */
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
}) => (
  <article
    className="liga-pantalla-match liga-pantalla-match--duel liga-jornada-match-card liga-jornada-match-card--final liga-jornada-match-card--hero-players"
    style={matchStyle}
  >
    <LigaJornadaMatchCardHeader
      canchaNum={canchaNum}
      estadoMod={estadoMod}
      estadoText={estadoText}
    />
    <div className="liga-jornada-match-card__final-body">
      <div className="liga-jornada-match-card__matchup">
        <LigaJornadaMatchPairStack
          side={side1}
          align="left"
          tone={p1Wins ? "win" : p2Wins ? "loss" : undefined}
          label={`Pareja: ${side1.name1} y ${side1.name2}`}
        />
        <div className="liga-jornada-match-card__vs" aria-hidden="true">
          <span className="liga-jornada-match-card__vs-line" />
          <span className="liga-jornada-match-card__vs-text">VS</span>
          <span className="liga-jornada-match-card__vs-line" />
        </div>
        <LigaJornadaMatchPairStack
          side={side2}
          align="right"
          tone={p2Wins ? "win" : p1Wins ? "loss" : undefined}
          label={`Pareja: ${side2.name1} y ${side2.name2}`}
        />
      </div>
      <div className="liga-jornada-match-card__final-score">
        <LigaJornadaMatchScoreGrid board={board} />
      </div>
    </div>
  </article>
);
