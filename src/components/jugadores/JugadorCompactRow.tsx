import React from "react";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { GrantedPlayerOriginBadge } from "./GrantedPlayerOriginBadge";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateJugadorFicha } from "./jugadoresNav";

export type JugadorCompactRowProps = {
  jugador: RivieraJugadorWithStats;
  rank: number;
  puntos: number;
  partidosLabel: string;
  pctLabel: string;
  showAjustePuntos: boolean;
  canRemove: boolean;
  canDelete: boolean;
  deleting: boolean;
  onAjustePuntos: () => void;
  onRemoveFromClub: () => void;
  onDelete: () => void;
};

export const JugadorCompactRow: React.FC<JugadorCompactRowProps> = ({
  jugador: j,
  rank,
  puntos,
  partidosLabel,
  pctLabel,
  showAjustePuntos,
  canRemove,
  canDelete,
  deleting,
  onAjustePuntos,
  onRemoveFromClub,
  onDelete,
}) => {
  const esPrimero = rank === 1;
  const showActions = showAjustePuntos || canRemove || canDelete;

  return (
    <div className="rj-row">
      <button
        type="button"
        className="rj-row__main"
        onClick={() => navigateJugadorFicha(j.slug)}
        aria-label={`Abrir ficha de ${j.nombre}`}
      >
        <span
          className={`rj-row__rank${esPrimero ? " rj-row__rank--gold" : ""}`}
        >
          {esPrimero ? <TablerIcon name="trophy" size={14} /> : `#${rank}`}
        </span>
        <span className="rj-row__player">
          <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="sm" />
          <span className="rj-row__name-wrap">
            <span className="rj-row__name">{j.nombre}</span>
            <JugadorPaisBadge codigo={j.pais_codigo} size="sm" />
            {j.concedidoPorAdmin ? (
              <GrantedPlayerOriginBadge jugador={j} />
            ) : null}
          </span>
        </span>
        <span className="rj-row__cat">
          <JugadorCategoriaBadge categoria={j.categoria} />
        </span>
        <span className="rj-row__pts">
          {puntos.toLocaleString("es-MX")}
          <span className="rj-row__pts-suffix"> pts</span>
        </span>
        <span className="rj-row__partidos">{partidosLabel}</span>
        <span className="rj-row__pct">{pctLabel}</span>
      </button>
      {showActions ? (
        <div className="rj-row__actions">
          {showAjustePuntos ? (
            <button
              type="button"
              className="rj-row__icon-btn"
              aria-label={`Ajustar puntos de ${j.nombre}`}
              title="Sumar o restar puntos"
              onClick={(e) => {
                e.stopPropagation();
                onAjustePuntos();
              }}
            >
              <TablerIcon name="pencil" size={14} />
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              className="rj-row__icon-btn rj-row__icon-btn--danger"
              aria-label={`Quitar a ${j.nombre} de tu club`}
              title="Quitar de mi club"
              disabled={deleting}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromClub();
              }}
            >
              <TablerIcon name="trash" size={14} />
            </button>
          ) : canDelete ? (
            <button
              type="button"
              className="rj-row__icon-btn rj-row__icon-btn--danger"
              aria-label={`Eliminar a ${j.nombre}`}
              title="Eliminar jugador"
              disabled={deleting}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <TablerIcon name="trash" size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
