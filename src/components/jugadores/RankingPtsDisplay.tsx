import React, { useMemo } from "react";
import {
  buildJugadorPuntosBreakdown,
  isRankingPointsBreakdownPending,
  resolveCareerTotalAllClubsDisplay,
  resolveOfficialPuntosDisplay,
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

function rankingPtsJugadorSignature(jugador: RivieraJugadorWithStats): string {
  return [
    jugador.id,
    jugador.riviera_id ?? "",
    jugador.careerPuntosTotal ?? "",
    jugador.officialPuntosGlobal ?? "",
    jugador.stats?.puntos_totales ?? "",
    jugador.pointsBreakdown?.careerTotalAllClubs ?? "",
    jugador.pointsBreakdown?.currentClubPoints ?? "",
    jugador.careerPuntosByClub?.map((c) => `${c.organizadorId}:${c.puntos}`).join("|") ?? "",
  ].join("::");
}

function RankingPtsDisplayInner({
  jugador,
  clubOrganizadorId,
  internalClub = false,
  className = "",
  variant = "stacked",
}: RankingPtsDisplayProps) {
  const jugadorSignature = rankingPtsJugadorSignature(jugador);

  const lines = useMemo(
    () =>
      internalClub
        ? buildJugadorPuntosBreakdown(jugador, clubOrganizadorId, {
            hasOrgContext: internalClub,
          })
        : null,
    [internalClub, clubOrganizadorId, jugadorSignature]
  );

  if (!internalClub) {
    const official = resolveOfficialPuntosDisplay(jugador);
    if (official.kind === "unavailable") {
      return (
        <span className={`rjp-pts--na${className ? ` ${className}` : ""}`} title="Ranking oficial no disponible">
          —
        </span>
      );
    }
    return (
      <span className={className}>
        {official.puntos.toLocaleString("es-MX")} pts
      </span>
    );
  }

  if (isRankingPointsBreakdownPending(jugador, { hasOrgContext: internalClub })) {
    return (
      <span
        className={`rjp-pts--na${className ? ` ${className}` : ""}`}
        aria-busy="true"
      >
        Cargando carrera…
      </span>
    );
  }

  if (!lines || lines.length === 0) {
    const pts = resolveCareerTotalAllClubsDisplay(
      jugador,
      internalClub,
      clubOrganizadorId
    );
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
}

function propsAreEqual(
  prev: RankingPtsDisplayProps,
  next: RankingPtsDisplayProps
): boolean {
  return (
    prev.clubOrganizadorId === next.clubOrganizadorId &&
    prev.internalClub === next.internalClub &&
    prev.variant === next.variant &&
    prev.className === next.className &&
    rankingPtsJugadorSignature(prev.jugador) ===
      rankingPtsJugadorSignature(next.jugador)
  );
}

export const RankingPtsDisplay = React.memo(RankingPtsDisplayInner, propsAreEqual);
