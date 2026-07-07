import React from "react";
import {
  buildJugadorPuntosBreakdown,
  resolveCareerTotalAllClubsDisplay,
} from "../../lib/rivieraJugadores/jugadorPuntosBreakdown";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

type JugadorPuntosBreakdownProps = {
  jugador: RivieraJugadorWithStats;
  clubOrganizadorId: string | null;
  hasOrgContext?: boolean;
  /** Card de perfil público: desglose de carrera local por club. */
  profileCard?: boolean;
  className?: string;
};

export const JugadorPuntosBreakdown: React.FC<JugadorPuntosBreakdownProps> = ({
  jugador,
  clubOrganizadorId,
  hasOrgContext = false,
  profileCard = false,
  className = "",
}) => {
  const lines = buildJugadorPuntosBreakdown(jugador, clubOrganizadorId, {
    hasOrgContext,
    profileCard,
  });

  if (lines.length === 0) {
    const pts = resolveCareerTotalAllClubsDisplay(
      jugador,
      hasOrgContext,
      clubOrganizadorId
    );
    return (
      <span className={`rjp-ficha-stat__val${className ? ` ${className}` : ""}`}>
        {pts.toLocaleString("es-MX")} pts
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
          {line.clubLabel}: {line.puntos.toLocaleString("es-MX")} pts
        </span>
      ))}
    </span>
  );
};
