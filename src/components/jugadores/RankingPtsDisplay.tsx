import React from "react";
import {
  buildJugadorPuntosBreakdown,
  simpleJugadorPuntosDisplay,
} from "../../lib/rivieraJugadores/jugadorPuntosBreakdown";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

type RankingPtsDisplayProps = {
  jugador: RivieraJugadorWithStats;
  clubOrganizadorId: string | null;
  /** Ranking interno del club anfitrión — pts = solo en este club. */
  internalClub?: boolean;
  className?: string;
  variant?: "inline" | "stacked";
};

export const RankingPtsDisplay: React.FC<RankingPtsDisplayProps> = ({
  jugador,
  clubOrganizadorId,
  internalClub = false,
  className = "",
  variant = "stacked",
}) => {
  const lines = buildJugadorPuntosBreakdown(jugador, clubOrganizadorId, {
    hasOrgContext: internalClub,
  });

  if (lines.length === 0) {
    const pts = simpleJugadorPuntosDisplay(jugador, internalClub);
    return (
      <span className={className}>
        {pts.toLocaleString("es-MX")} pts
      </span>
    );
  }

  const stacked = variant === "stacked";

  return (
    <span
      className={`rjp-pts-breakdown${
        stacked ? " rjp-pts-breakdown--stacked" : ""
      }${className ? ` ${className}` : ""}`}
    >
      {lines.map((line) => (
        <span
          key={line.key}
          className={`rjp-pts-breakdown__line rjp-pts-breakdown__line--${line.role}`}
        >
          {line.clubLabel}: {line.puntos.toLocaleString("es-MX")} pts
        </span>
      ))}
    </span>
  );
};
