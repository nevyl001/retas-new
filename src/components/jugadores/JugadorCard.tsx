import React from "react";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { GrantedPlayerOriginBadge } from "./GrantedPlayerOriginBadge";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateJugadorFicha } from "./jugadoresNav";

export type JugadorCardProps = {
  jugador: RivieraJugadorWithStats;
  puntos: number;
  partidosCount: number;
  pctLabel: string;
  showEditar: boolean;
  showAjustePuntos: boolean;
  canRemove: boolean;
  canDelete: boolean;
  deleting: boolean;
  onAjustePuntos: () => void;
  onRemoveFromClub: () => void;
  onDelete: () => void;
};

export const JugadorCard: React.FC<JugadorCardProps> = ({
  jugador: j,
  puntos,
  partidosCount,
  pctLabel,
  showEditar,
  showAjustePuntos,
  canRemove,
  canDelete,
  deleting,
  onAjustePuntos,
  onRemoveFromClub,
  onDelete,
}) => {
  const showMenu = showEditar || showAjustePuntos || canRemove || canDelete;
  const sinActividad = partidosCount === 0;
  const showPuntos = !sinActividad || puntos > 0;

  const lineParts: string[] = [];
  if (showPuntos) lineParts.push(`${puntos.toLocaleString("es-MX")} pts`);
  if (sinActividad) {
    lineParts.push("Sin actividad todavía");
  } else {
    lineParts.push(`${partidosCount} partidos`);
    lineParts.push(`${pctLabel} victorias`);
  }

  return (
    <div className="rj-card">
      <button
        type="button"
        className="rj-card__main"
        onClick={() => navigateJugadorFicha(j.slug)}
        aria-label={`Abrir ficha de ${j.nombre}`}
      >
        <span className="rj-card__top">
          <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="sm" />
          <span className="rj-card__name">{j.nombre}</span>
        </span>
        <span className="rj-card__meta">
          <JugadorPaisBadge codigo={j.pais_codigo} size="sm" showCode={false} />
          <JugadorCategoriaBadge categoria={j.categoria} className="rj-card__cat" />
          {j.concedidoPorAdmin ? (
            <GrantedPlayerOriginBadge jugador={j} />
          ) : null}
        </span>
        <span
          className={`rj-card__line${sinActividad ? " rj-card__line--muted" : ""}`}
        >
          {lineParts.join(" · ")}
        </span>
      </button>

      {showMenu ? (
        <details className="rj-card__menu">
          <summary
            className="rj-card__menu-trigger"
            aria-label={`Más acciones para ${j.nombre}`}
          >
            <TablerIcon name="dots" size={16} />
          </summary>
          <div className="rj-card__menu-list">
            {showEditar ? (
              <button
                type="button"
                className="rj-card__menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateJugadorFicha(j.slug, { edit: true });
                }}
              >
                <TablerIcon name="pencil" size={16} />
                Editar
              </button>
            ) : null}
            {showAjustePuntos ? (
              <button
                type="button"
                className="rj-card__menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onAjustePuntos();
                }}
              >
                <TablerIcon name="adjustments" size={16} />
                Ajustar puntos
              </button>
            ) : null}
            {canRemove ? (
              <button
                type="button"
                className="rj-card__menu-item rj-card__menu-item--danger"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromClub();
                }}
              >
                <TablerIcon name="trash" size={16} />
                Quitar de mi club
              </button>
            ) : canDelete ? (
              <button
                type="button"
                className="rj-card__menu-item rj-card__menu-item--danger"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <TablerIcon name="trash" size={16} />
                Eliminar jugador
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
};
