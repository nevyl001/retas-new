import React from "react";
import { useOrganizerDisplayName } from "../../club-experience";
import {
  hasDualRankingConcedido,
  rankingPuntosCarreraRivieraDisplay,
  rankingPuntosGlobalDisplay,
  rankingPuntosInternoClubDisplay,
  resolveOrigenConcedidoOrganizadorId,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

type RankingPtsDisplayProps = {
  jugador: RivieraJugadorWithStats;
  clubOrganizadorId: string | null;
  /** Ranking interno del club anfitrión (Hack, etc.) — pts = solo en este club. */
  internalClub?: boolean;
  className?: string;
  variant?: "inline" | "stacked";
};

export const RankingPtsDisplay: React.FC<RankingPtsDisplayProps> = ({
  jugador,
  clubOrganizadorId,
  internalClub = false,
  className = "",
  variant = "inline",
}) => {
  const localPts = jugador.stats?.puntos_totales ?? 0;
  const clubPts = rankingPuntosInternoClubDisplay(jugador);
  const totalPts = rankingPuntosGlobalDisplay(jugador);
  const clubName = useOrganizerDisplayName(clubOrganizadorId);
  const origenId = resolveOrigenConcedidoOrganizadorId(jugador);
  const origenName = useOrganizerDisplayName(origenId);
  const stacked = variant === "stacked";

  if (hasDualRankingConcedido(jugador)) {
    const carreraPts = rankingPuntosCarreraRivieraDisplay(jugador);

    if (internalClub) {
      return (
        <span
          className={`rjp-ranking-dual-pts${
            stacked ? " rjp-ranking-dual-pts--stacked" : ""
          }${className ? ` ${className}` : ""}`}
        >
          <span className="rjp-ranking-dual-pts__total">
            {clubName}: {clubPts.toLocaleString("es-MX")} pts
          </span>
          {origenId ? (
            <span className="rjp-ranking-dual-pts__origen">
              {origenName}: {carreraPts.toLocaleString("es-MX")} pts
            </span>
          ) : null}
        </span>
      );
    }

    return (
      <span
        className={`rjp-ranking-dual-pts${
          stacked ? " rjp-ranking-dual-pts--stacked" : ""
        }${className ? ` ${className}` : ""}`}
      >
        <span className="rjp-ranking-dual-pts__total">
          {totalPts.toLocaleString("es-MX")} pts total
        </span>
        <span className="rjp-ranking-dual-pts__local">
          {clubName}: {localPts.toLocaleString("es-MX")} pts
        </span>
        <span className="rjp-ranking-dual-pts__origen">
          {origenName}: {carreraPts.toLocaleString("es-MX")} pts
        </span>
      </span>
    );
  }

  if (
    !internalClub &&
    jugador.officialPuntosGlobal != null &&
    jugador.officialPuntosGlobal > localPts
  ) {
    return (
      <span
        className={`rjp-ranking-dual-pts${
          stacked ? " rjp-ranking-dual-pts--stacked" : ""
        }${className ? ` ${className}` : ""}`}
      >
        <span className="rjp-ranking-dual-pts__total">
          {totalPts.toLocaleString("es-MX")} pts total
        </span>
        <span className="rjp-ranking-dual-pts__origen">
          {clubName}: {localPts.toLocaleString("es-MX")} pts
        </span>
      </span>
    );
  }

  const displayPts = internalClub ? clubPts : totalPts;
  return (
    <span className={className}>
      {displayPts.toLocaleString("es-MX")} pts
    </span>
  );
};
