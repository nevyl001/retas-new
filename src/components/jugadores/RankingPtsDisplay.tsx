import React from "react";
import { useOrganizerDisplayName } from "../../club-experience";
import {
  rankingPuntosCarreraRivieraDisplay,
  rankingPuntosGlobalDisplay,
  rankingPuntosOrigenConcedido,
  hasDualRankingConcedido,
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
  const totalPts = rankingPuntosGlobalDisplay(jugador);
  const clubName = useOrganizerDisplayName(clubOrganizadorId);
  const origenName = useOrganizerDisplayName(
    jugador.grantedAccess?.ownerOrganizadorId
  );
  const stacked = variant === "stacked";

  /** Ranking interno: una sola línea con club origen + lo jugado aquí (carrera Riviera). */
  if (internalClub) {
    const totalRivieraPts = rankingPuntosCarreraRivieraDisplay(jugador);
    return (
      <span
        className={`rjp-ranking-dual-pts${
          stacked ? " rjp-ranking-dual-pts--stacked" : ""
        }${className ? ` ${className}` : ""}`}
      >
        <span className="rjp-ranking-dual-pts__total">
          Total Riviera: {totalRivieraPts.toLocaleString("es-MX")} pts
        </span>
      </span>
    );
  }

  if (hasDualRankingConcedido(jugador)) {
    const origenLocalPts = rankingPuntosOrigenConcedido(jugador);

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
          {origenName}: {origenLocalPts.toLocaleString("es-MX")} pts
        </span>
      </span>
    );
  }

  if (
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

  return (
    <span className={className}>
      {totalPts.toLocaleString("es-MX")} pts
    </span>
  );
};
