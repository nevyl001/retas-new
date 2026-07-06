import React from "react";
import {
  buildJugadorPuntosBreakdown,
  simpleJugadorPuntosDisplay,
} from "../../lib/rivieraJugadores/jugadorPuntosBreakdown";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

type JugadorPuntosBreakdownProps = {
  jugador: RivieraJugadorWithStats;
  clubOrganizadorId: string | null;
  internalClub?: boolean;
  className?: string;
};

export const JugadorPuntosBreakdown: React.FC<JugadorPuntosBreakdownProps> = ({
  jugador,
  clubOrganizadorId,
  internalClub = false,
  className = "",
}) => {
  const lines = buildJugadorPuntosBreakdown(jugador, clubOrganizadorId, {
    internalClub,
  });

  if (lines.length === 0) {
    const pts = simpleJugadorPuntosDisplay(jugador, internalClub);
    return (
      <span className={`rjp-ficha-stat__val${className ? ` ${className}` : ""}`}>
        {pts.toLocaleString("es-MX")}
      </span>
    );
  }

  return (
    <span
      className={`rjp-ficha-stat__val rjp-pts-breakdown rjp-pts-breakdown--stacked rjp-pts-breakdown--ficha${
        className ? ` ${className}` : ""
      }`}
    >
      {lines.map((line) => (
        <span
          key={line.key}
          className={`rjp-pts-breakdown__line rjp-pts-breakdown__line--${line.role}`}
        >
          {line.role === "total" ? line.clubLabel : `${line.clubLabel}:`}{" "}
          {line.puntos.toLocaleString("es-MX")} pts
        </span>
      ))}
    </span>
  );
};
