import React from "react";
import {
  getOrganizadorClubDisplayName,
  hasDualRankingConcedido,
  rankingPuntosGlobalDisplay,
  rankingPuntosOrigenConcedido,
  resolveOrigenConcedidoOrganizadorId,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

type RankingPtsDisplayProps = {
  jugador: RivieraJugadorWithStats;
  clubOrganizadorId: string | null;
  className?: string;
  variant?: "inline" | "stacked";
};

export const RankingPtsDisplay: React.FC<RankingPtsDisplayProps> = ({
  jugador,
  clubOrganizadorId,
  className = "",
  variant = "inline",
}) => {
  const localPts = jugador.stats?.puntos_totales ?? 0;
  const totalPts = rankingPuntosGlobalDisplay(jugador);
  const clubName = getOrganizadorClubDisplayName(clubOrganizadorId);
  const stacked = variant === "stacked";

  if (hasDualRankingConcedido(jugador)) {
    const origenId = resolveOrigenConcedidoOrganizadorId(jugador);
    const origenName = getOrganizadorClubDisplayName(origenId);
    const origenPts = rankingPuntosOrigenConcedido(jugador);

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
          {origenName}: {origenPts.toLocaleString("es-MX")} pts
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
