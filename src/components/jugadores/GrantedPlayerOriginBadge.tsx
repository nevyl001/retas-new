import React from "react";
import { useOrganizerDisplayName } from "../../club-experience";
import {
  prefetchOrganizerDisplayNames,
  resolveOrigenConcedidoOrganizadorId,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { TablerIcon } from "../ui/TablerIcon";

type GrantedPlayerOriginBadgeProps = {
  jugador: RivieraJugadorWithStats;
  className?: string;
};

export const GrantedPlayerOriginBadge: React.FC<GrantedPlayerOriginBadgeProps> = ({
  jugador,
  className = "",
}) => {
  const origenId = resolveOrigenConcedidoOrganizadorId(jugador);
  const origenName = useOrganizerDisplayName(origenId);

  React.useEffect(() => {
    if (origenId) void prefetchOrganizerDisplayNames([origenId]);
  }, [origenId]);

  const label = origenId ? `Desde ${origenName}` : "Concedido";
  const title = origenId
    ? `Jugador cedido desde ${origenName}`
    : "Acceso concedido por Admin Principal";

  return (
    <span
      className={`rj-granted-badge rj-granted-badge--inline${
        className ? ` ${className}` : ""
      }`}
      title={title}
      aria-label={title}
    >
      <TablerIcon name="share-3" size={11} />
      <span className="rj-granted-badge__label">{label}</span>
    </span>
  );
};
