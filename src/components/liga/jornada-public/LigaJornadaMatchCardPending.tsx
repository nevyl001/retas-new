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

/**
 * Card pendiente/live — enfrentamiento editorial:
 * pareja izq (J1↑ J2↓) · VS · pareja der (J3↑ J4↓)
 */
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
    className="liga-pantalla-match liga-pantalla-match--duel liga-jornada-match-card liga-jornada-match-card--pending liga-jornada-match-card--broadcast liga-jornada-match-card--duel-row liga-jornada-match-card--duel-stacks"
    style={matchStyle}
  >
    <LigaJornadaMatchCardHeader
      canchaNum={canchaNum}
      estadoMod={estadoMod}
      estadoText={estadoText}
    />
    <div className="liga-jornada-match-card__duel">
      <LigaJornadaMatchPairStack
        side={side1}
        align="left"
        label={`${side1.name1} y ${side1.name2}`}
      />
      <LigaJornadaMatchVsDivider />
      <LigaJornadaMatchPairStack
        side={side2}
        align="right"
        label={`${side2.name1} y ${side2.name2}`}
      />
    </div>
  </article>
);
