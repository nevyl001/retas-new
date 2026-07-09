import React, { useMemo } from "react";
import {
  buildJugadorPuntosBreakdown,
  isRankingPointsBreakdownPending,
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

function breakdownJugadorSignature(jugador: RivieraJugadorWithStats): string {
  return [
    jugador.id,
    jugador.riviera_id ?? "",
    jugador.careerPuntosTotal ?? "",
    jugador.pointsBreakdown?.careerTotalAllClubs ?? "",
    jugador.pointsBreakdown?.currentClubPoints ?? "",
    jugador.careerPuntosByClub?.map((c) => `${c.organizadorId}:${c.puntos}`).join("|") ?? "",
    jugador.stats?.puntos_totales ?? "",
  ].join("::");
}

function JugadorPuntosBreakdownInner({
  jugador,
  clubOrganizadorId,
  hasOrgContext = false,
  profileCard = false,
  className = "",
}: JugadorPuntosBreakdownProps) {
  const lines = useMemo(
    () =>
      buildJugadorPuntosBreakdown(jugador, clubOrganizadorId, {
        hasOrgContext,
        profileCard,
      }),
    [clubOrganizadorId, hasOrgContext, profileCard, jugador]
  );

  if (isRankingPointsBreakdownPending(jugador, { hasOrgContext })) {
    return (
      <span
        className={`rjp-ficha-stat__val rjp-pts--na${className ? ` ${className}` : ""}`}
        aria-busy="true"
      >
        Cargando carrera…
      </span>
    );
  }

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
}

function propsAreEqual(
  prev: JugadorPuntosBreakdownProps,
  next: JugadorPuntosBreakdownProps
): boolean {
  return (
    prev.clubOrganizadorId === next.clubOrganizadorId &&
    prev.hasOrgContext === next.hasOrgContext &&
    prev.profileCard === next.profileCard &&
    prev.className === next.className &&
    breakdownJugadorSignature(prev.jugador) ===
      breakdownJugadorSignature(next.jugador)
  );
}

export const JugadorPuntosBreakdown = React.memo(
  JugadorPuntosBreakdownInner,
  propsAreEqual
);
