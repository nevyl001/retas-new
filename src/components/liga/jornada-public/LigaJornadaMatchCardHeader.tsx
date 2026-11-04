import React from "react";

interface LigaJornadaMatchCardHeaderProps {
  canchaNum: string | number;
  estadoMod: "pending" | "live" | "done" | "draw";
  estadoText: string;
  /** Etiqueta de playoffs (Gran Final / 3.er lugar). Sustituye “Cancha N”. */
  matchLabel?: string | null;
}

export const LigaJornadaMatchCardHeader: React.FC<
  LigaJornadaMatchCardHeaderProps
> = ({ canchaNum, estadoMod, estadoText, matchLabel }) => (
  <header className="liga-pantalla-match__head">
    <div className="liga-pantalla-match__head-left">
      <span className="liga-pantalla-match__cancha">
        {matchLabel ? (
          <span className="liga-pantalla-match__cancha-num liga-pantalla-match__cancha-num--slot">
            {matchLabel}
          </span>
        ) : (
          <>
            <span className="liga-pantalla-match__cancha-kicker">Cancha</span>
            <span className="liga-pantalla-match__cancha-num">{canchaNum}</span>
          </>
        )}
      </span>
    </div>
    <span
      className={`liga-pantalla-match__status liga-pantalla-match__status--${estadoMod}`}
    >
      <span className="liga-pantalla-match__status-dot" aria-hidden />
      {estadoText}
    </span>
  </header>
);
