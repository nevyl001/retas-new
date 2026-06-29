import React from "react";
import {
  getOrganizadorClubDisplayName,
  hasDualRankingConcedido,
  rankingPuntosOrigenConcedido,
  resolveOrigenConcedidoOrganizadorId,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import { rankingPuntosJugador } from "../../lib/rivieraJugadores/rankingPosition";
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
  const localPts = rankingPuntosJugador(jugador);
  const clubName = getOrganizadorClubDisplayName(clubOrganizadorId);

  if (hasDualRankingConcedido(jugador)) {
    const origenId = resolveOrigenConcedidoOrganizadorId(jugador);
    const origenName = getOrganizadorClubDisplayName(origenId);
    const origenPts = rankingPuntosOrigenConcedido(jugador);
    const stacked = variant === "stacked";

    return (
      <span
        className={`rjp-ranking-dual-pts${
          stacked ? " rjp-ranking-dual-pts--stacked" : ""
        }${className ? ` ${className}` : ""}`}
      >
        <span className="rjp-ranking-dual-pts__local">
          {clubName}: {localPts.toLocaleString("es-MX")} pts
        </span>
        <span className="rjp-ranking-dual-pts__origen">
          {origenName}: {origenPts.toLocaleString("es-MX")} pts
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      {localPts.toLocaleString("es-MX")} pts
    </span>
  );
};
