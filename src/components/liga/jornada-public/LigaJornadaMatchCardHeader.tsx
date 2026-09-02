import React from "react";

interface LigaJornadaMatchCardHeaderProps {
  canchaNum: string | number;
  estadoMod: "pending" | "live" | "done";
  estadoText: string;
}

export const LigaJornadaMatchCardHeader: React.FC<
  LigaJornadaMatchCardHeaderProps
> = ({ canchaNum, estadoMod, estadoText }) => (
  <header className="liga-pantalla-match__head">
    <div className="liga-pantalla-match__head-left">
      <span className="liga-pantalla-match__cancha">Cancha {canchaNum}</span>
    </div>
    <span
      className={`liga-pantalla-match__status liga-pantalla-match__status--${estadoMod}`}
    >
      {estadoText}
    </span>
  </header>
);
