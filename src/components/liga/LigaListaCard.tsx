import React from "react";
import type { Liga } from "../../lib/liga/types";
import { isEquiposModalidad } from "../../lib/liga/ligaModalidad";
import { ligaModalidadCardLabel } from "../../lib/liga/types";
import { Badge, Button } from "../ui";
import type { BadgeVariant } from "../ui/Badge";
import { TablerIcon } from "../ui/TablerIcon";
import {
  TeActionMenu,
  type TeActionMenuItem,
} from "../torneo-express/TeActionMenu";

export type LigaListaFilter = "all" | "in_progress" | "completed";

const ESTADO_LABEL: Record<Liga["estado"], string> = {
  upcoming: "Programada",
  in_progress: "En curso",
  completed: "Finalizada",
};

const ESTADO_BADGE: Record<Liga["estado"], BadgeVariant> = {
  upcoming: "scheduled",
  in_progress: "live",
  completed: "finished",
};

export function ligaEstadoLabel(estado: Liga["estado"]): string {
  return ESTADO_LABEL[estado] ?? estado;
}

export function ligaParticipantesLabel(liga: Liga): string {
  if (isEquiposModalidad(liga.modalidad)) {
    const n = liga.equipos_count ?? 0;
    return n === 1 ? "1 pareja" : `${n} parejas`;
  }
  const n = liga.inscripciones_count ?? 0;
  return n === 1 ? "1 jugador" : `${n} jugadores`;
}

export function ligaAvanceLabel(liga: Liga): string | null {
  const total = liga.jornadas_count ?? 0;
  const actual = liga.jornada_actual_numero;
  if (total <= 0 || actual == null || actual <= 0) return null;
  return `Jornada ${actual} de ${total}`;
}

export type LigaListaCardProps = {
  liga: Liga;
  deleting: boolean;
  deleteDisabled: boolean;
  onManage: () => void;
  onDelete: () => void;
};

export const LigaListaCard: React.FC<LigaListaCardProps> = ({
  liga,
  deleting,
  deleteDisabled,
  onManage,
  onDelete,
}) => {
  const titleId = `liga-home-card-${liga.id}-title`;
  const avance = ligaAvanceLabel(liga);
  const menuItems: TeActionMenuItem[] = [
    {
      id: "delete",
      label: deleting ? "Eliminando…" : "Eliminar liga",
      danger: true,
      disabled: deleteDisabled || deleting,
      onSelect: onDelete,
    },
  ];

  return (
    <li
      className={`liga-home-card liga-home-card--${liga.estado}`}
      aria-labelledby={titleId}
    >
      <div className="liga-home-card__top">
        <Badge
          variant={ESTADO_BADGE[liga.estado]}
          className="liga-home-card__state"
        >
          {ligaEstadoLabel(liga.estado)}
        </Badge>
        <TeActionMenu
          label={`Más acciones de ${liga.nombre}`}
          items={menuItems}
          disabled={deleteDisabled && !deleting}
          className="liga-home-card__menu"
        />
      </div>

      <div className="liga-home-card__body">
        <h3 id={titleId} className="liga-home-card__title" title={liga.nombre}>
          {liga.nombre}
        </h3>
        <p className="liga-home-card__modality">
          {ligaModalidadCardLabel(liga.modalidad)}
        </p>

        <ul className="liga-home-card__meta">
          <li>
            <TablerIcon name="users" size={14} />
            <span>{ligaParticipantesLabel(liga)}</span>
          </li>
          {avance ? (
            <li>
              <TablerIcon name="calendar-event" size={14} />
              <span>{avance}</span>
            </li>
          ) : null}
        </ul>
      </div>

      <footer className="liga-home-card__footer">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="liga-home-card__manage"
          disabled={deleteDisabled}
          onClick={onManage}
        >
          Gestionar
          <TablerIcon name="arrow-right" size={16} />
        </Button>
      </footer>
    </li>
  );
};
