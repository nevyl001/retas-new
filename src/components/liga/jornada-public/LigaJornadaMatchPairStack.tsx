import React from "react";
import { LigaJornadaMatchPlayerRow } from "./LigaJornadaMatchPlayerRow";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";

interface LigaJornadaMatchPairStackProps {
  side: LigaJornadaMatchPairSide;
  /** Pareja B: avatares a la derecha del nombre. */
  align?: "left" | "right";
  tone?: "win" | "loss";
  label?: string;
}

/** Dos filas jugador = una pareja (sin &, sin avatares horizontales). */
export const LigaJornadaMatchPairStack: React.FC<LigaJornadaMatchPairStackProps> = ({
  side,
  align = "left",
  tone,
  label,
}) => (
  <div
    className={`liga-jornada-match-pair-stack liga-jornada-match-pair-stack--${align}${
      tone ? ` liga-jornada-match-pair-stack--${tone}` : ""
    }`}
    aria-label={label ?? `Pareja: ${side.name1} y ${side.name2}`}
  >
    <LigaJornadaMatchPlayerRow name={side.name1} foto={side.foto1} />
    <LigaJornadaMatchPlayerRow name={side.name2} foto={side.foto2} />
  </div>
);
