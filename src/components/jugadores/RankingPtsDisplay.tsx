import React from "react";
import {
  buildJugadorPuntosBreakdown,
  isRankingPointsBreakdownPending,
  resolveCareerTotalAllClubsDisplay,
  resolveOfficialPuntosDisplay,
} from "../../lib/rivieraJugadores/jugadorPuntosBreakdown";
import { logRankingPointsAuditFromJugador } from "../../lib/rivieraJugadores/rankingPointsAudit";
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
  if (!internalClub) {
    const official = resolveOfficialPuntosDisplay(jugador);
    logRankingPointsAuditFromJugador(
      "RankingPtsDisplay (ROMC global)",
      jugador,
      clubOrganizadorId,
      { officialKind: official.kind }
    );
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

  const lines = buildJugadorPuntosBreakdown(jugador, clubOrganizadorId, {
    hasOrgContext: internalClub,
  });

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

  logRankingPointsAuditFromJugador(
    "RankingPtsDisplay (React)",
    jugador,
    clubOrganizadorId,
    { lineCount: lines.length }
  );

  if (lines.length === 0) {
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
};
