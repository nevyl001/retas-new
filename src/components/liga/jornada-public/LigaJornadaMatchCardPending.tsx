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

/** Card pendiente/live — layout vertical (pareja 1 arriba) sin marcador. */
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
    className="liga-pantalla-match liga-pantalla-match--duel liga-jornada-match-card liga-jornada-match-card--pending liga-jornada-match-card--hero-players liga-jornada-match-card--broadcast liga-jornada-match-card--split-vs liga-jornada-match-card--stack-vs"
    style={matchStyle}
  >
    <LigaJornadaMatchCardHeader
      canchaNum={canchaNum}
      estadoMod={estadoMod}
      estadoText={estadoText}
    />
    <div className="liga-jornada-match-card__split">
      <LigaJornadaMatchPairStack
        side={side1}
        align="top"
        label={`Pareja: ${side1.name1} y ${side1.name2}`}
      />
      <div className="liga-jornada-match-card__split-vs" aria-hidden="true">
        <span className="liga-jornada-match-card__split-vs-line" />
        <span className="liga-jornada-match-card__split-vs-badge">VS</span>
      </div>
      <LigaJornadaMatchPairStack
        side={side2}
        align="bottom"
        label={`Pareja: ${side2.name1} y ${side2.name2}`}
      />
    </div>
  </article>
);
