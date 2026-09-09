import React from "react";
import { LigaJornadaMatchPlayerPanel } from "./LigaJornadaMatchPlayerPanel";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";

interface LigaJornadaMatchPairStackProps {
  side: LigaJornadaMatchPairSide;
  align?: "top" | "bottom" | "left" | "right";
  tone?: "win" | "loss";
  label?: string;
}

/** Fila de pareja (layout vertical): 2 paneles lado a lado a ancho completo. */
export const LigaJornadaMatchPairStack: React.FC<
  LigaJornadaMatchPairStackProps
> = ({ side, align = "top", tone, label }) => (
  <div
    className={`liga-jornada-match-pair-half liga-jornada-match-pair-half--${align}${
      tone ? ` liga-jornada-match-pair-half--${tone}` : ""
    }`}
    aria-label={label ?? `Pareja: ${side.name1} y ${side.name2}`}
  >
    {tone === "win" ? (
      <span
        className="liga-jornada-match-pair-half__badge"
        aria-label="Ganador"
        title="Ganador"
      >
        <span className="liga-jornada-match-pair-half__badge-icon" aria-hidden>
          ♔
        </span>
      </span>
    ) : null}
    <div className="liga-jornada-match-pair-half__grid">
      <LigaJornadaMatchPlayerPanel name={side.name1} foto={side.foto1} />
      <LigaJornadaMatchPlayerPanel name={side.name2} foto={side.foto2} />
    </div>
  </div>
);
