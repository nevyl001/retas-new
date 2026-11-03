import React from "react";
import { LigaJornadaMatchCardHeader } from "./LigaJornadaMatchCardHeader";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";
import { LigaJornadaMatchPairStack } from "./LigaJornadaMatchPairStack";
import { LigaJornadaMatchVsDivider } from "./LigaJornadaMatchVsDivider";

interface LigaJornadaMatchCardPendingProps {
  canchaNum: string | number;
  estadoMod: "pending" | "live" | "done";
  estadoText: string;
  side1: LigaJornadaMatchPairSide;
  side2: LigaJornadaMatchPairSide;
  matchStyle?: React.CSSProperties;
}

/** Card pendiente/live — Pareja A arriba, VS editorial, Pareja B abajo. */
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
        pairLabel="Pareja A"
        label={`Pareja A: ${side1.name1} y ${side1.name2}`}
      />
      <LigaJornadaMatchVsDivider />
      <LigaJornadaMatchPairStack
        side={side2}
        align="bottom"
        pairLabel="Pareja B"
        label={`Pareja B: ${side2.name1} y ${side2.name2}`}
      />
    </div>
  </article>
);
