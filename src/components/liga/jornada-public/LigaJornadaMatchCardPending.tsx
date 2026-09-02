import React from "react";
import { LigaJornadaMatchCardHeader } from "./LigaJornadaMatchCardHeader";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";
import { LigaJornadaMatchPairStack } from "./LigaJornadaMatchPairStack";

interface LigaJornadaMatchCardPendingProps {
  canchaNum: string | number;
  estadoMod: "pending" | "live" | "done";
  estadoText: string;
  side1: LigaJornadaMatchPairSide;
  side2: LigaJornadaMatchPairSide;
  matchStyle?: React.CSSProperties;
}

/** Card pendiente — parejas en filas verticales, VS editorial. */
export const LigaJornadaMatchCardPending: React.FC<
  LigaJornadaMatchCardPendingProps
> = ({
  canchaNum,
  estadoMod,
  estadoText,
  side1,
  side2,
  matchStyle,
}) => (
  <article
    className="liga-pantalla-match liga-jornada-match-card liga-jornada-match-card--pending liga-jornada-match-card--hero-players"
    style={matchStyle}
  >
    <LigaJornadaMatchCardHeader
      canchaNum={canchaNum}
      estadoMod={estadoMod}
      estadoText={estadoText}
    />
    <div className="liga-jornada-match-card__matchup">
      <LigaJornadaMatchPairStack
        side={side1}
        align="left"
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
        label={`Pareja: ${side2.name1} y ${side2.name2}`}
      />
    </div>
  </article>
);
