import React from "react";
import { formatPairCompactLine } from "./ligaJornadaMatchNames";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";

interface LigaJornadaMatchPairLineProps {
  side: LigaJornadaMatchPairSide;
  win?: boolean;
  loss?: boolean;
  align?: "left" | "right" | "center";
}

/** Línea de pareja solo texto (card final). */
export const LigaJornadaMatchPairLine: React.FC<LigaJornadaMatchPairLineProps> = ({
  side,
  win = false,
  loss = false,
  align = "left",
}) => {
  const label = formatPairCompactLine(side.name1, side.name2);
  return (
    <p
      className={`liga-jornada-match-pair-line liga-jornada-match-pair-line--${align}${
        win ? " liga-jornada-match-pair-line--win" : ""
      }${loss ? " liga-jornada-match-pair-line--loss" : ""}`}
      title={`${side.name1} / ${side.name2}`}
    >
      {label}
    </p>
  );
};
