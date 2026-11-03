import React from "react";
import { LigaJornadaMatchPlayerPanel } from "./LigaJornadaMatchPlayerPanel";
import type { LigaJornadaMatchPairSide } from "./ligaJornadaMatchTypes";

interface LigaJornadaMatchPairStackProps {
  side: LigaJornadaMatchPairSide;
  align?: "top" | "bottom" | "left" | "right";
  tone?: "win" | "loss";
  label?: string;
  /** Etiqueta visible discreta (Pareja A / Pareja B). */
  pairLabel?: string;
}

/** Bloque de pareja: 2 jugadores lado a lado dentro de la composición vertical. */
export const LigaJornadaMatchPairStack: React.FC<
  LigaJornadaMatchPairStackProps
> = ({ side, align = "top", tone, label, pairLabel }) => (
  <div
    className={`liga-jornada-match-pair-half liga-jornada-match-pair-half--${align}${
      tone ? ` liga-jornada-match-pair-half--${tone}` : ""
    }`}
    aria-label={label ?? `Pareja: ${side.name1} y ${side.name2}`}
  >
    {pairLabel ? (
      <p className="liga-jornada-match-pair-half__label">{pairLabel}</p>
    ) : null}
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
      <LigaJornadaMatchPlayerPanel
        name={side.name1}
        foto={side.foto1}
        rating={side.rating1}
      />
      <LigaJornadaMatchPlayerPanel
        name={side.name2}
        foto={side.foto2}
        rating={side.rating2}
      />
    </div>
  </div>
);
