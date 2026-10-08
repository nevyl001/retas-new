import React from "react";
import type { TorneoExpressEstado } from "../../lib/torneoExpress/types";
import { Badge, Button } from "../ui";
import type { BadgeVariant } from "../ui/Badge";
import { TablerIcon } from "../ui/TablerIcon";
import "./te-evento-detalle.css";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  finalizado: "Finalizado",
};

const ESTADO_BADGE: Record<string, BadgeVariant> = {
  finalizado: "finished",
  en_curso: "live",
};

export type EventoCategoriaCardProps = {
  /** Nombre visible de la categoría. */
  title: string;
  /** Estado ya resuelto para mostrar (no se recalcula aquí). */
  displayEstado: TorneoExpressEstado;
  /** Texto de respaldo si el estado no tiene etiqueta conocida. */
  fallbackEstadoLabel: string;
  isEditing: boolean;
  draftName: string;
  /** Guardando el renombre de esta categoría. */
  saving: boolean;
  /** Hay un borrado en curso (deshabilita Borrar). */
  deleting: boolean;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onManage: () => void;
  onDelete: () => void;
};

/**
 * Tarjeta compacta de una categoría del evento. Solo presentación: toda la lógica
 * (renombrar, borrar, navegar) llega por props desde `EventoDetalle`.
 */
export const EventoCategoriaCard: React.FC<EventoCategoriaCardProps> = ({
  title,
  displayEstado,
  fallbackEstadoLabel,
  isEditing,
  draftName,
  saving,
  deleting,
  onDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onManage,
  onDelete,
}) => (
  <li className={`te-evd-cat te-evd-cat--${displayEstado}`}>
    <div className="te-evd-cat__head">
      {isEditing ? (
        <div
          className="te-evd-cat__edit"
          role="group"
          aria-label={`Renombrar ${title}`}
        >
          <input
            type="text"
            className="te-evd-cat__edit-input"
            value={draftName}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommitEdit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            disabled={saving}
            maxLength={80}
            autoFocus
            aria-label="Nuevo nombre de la categoría"
          />
          <button
            type="button"
            className="te-evd-cat__edit-btn te-evd-cat__edit-btn--ok"
            onClick={onCommitEdit}
            disabled={saving}
            aria-label="Guardar categoría"
          >
            ✓
          </button>
          <button
            type="button"
            className="te-evd-cat__edit-btn"
            onClick={onCancelEdit}
            disabled={saving}
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <h3 className="te-evd-cat__title">{title}</h3>
          <button
            type="button"
            className="te-evd-cat__pencil"
            onClick={onStartEdit}
            aria-label={`Editar categoría ${title}`}
            title="Editar categoría"
          >
            <TablerIcon name="pencil" size={14} />
          </button>
        </>
      )}
      <Badge
        variant={ESTADO_BADGE[displayEstado] ?? "pending"}
        className="te-evd-cat__state"
      >
        {ESTADO_LABEL[displayEstado] ?? fallbackEstadoLabel}
      </Badge>
    </div>
    <div className="te-evd-cat__actions">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="te-evd-cat__manage"
        onClick={onManage}
      >
        Gestionar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="te-evd-cat__delete"
        disabled={deleting || saving}
        onClick={onDelete}
      >
        <TablerIcon name="trash" size={15} />
        Borrar
      </Button>
    </div>
  </li>
);
