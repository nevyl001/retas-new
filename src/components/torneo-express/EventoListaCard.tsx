import React, { useState } from "react";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import {
  EVENTO_TEMPORAL_LABEL,
  type EventoTemporalEstado,
} from "../../lib/torneoExpress/eventoTemporal";
import { Badge, Button } from "../ui";
import type { BadgeVariant } from "../ui/Badge";
import { TablerIcon } from "../ui/TablerIcon";
import { TeActionMenu, type TeActionMenuItem } from "./TeActionMenu";

export const BADGE_BY_TEMPORAL: Record<EventoTemporalEstado, BadgeVariant> = {
  en_curso: "live",
  proximo: "scheduled",
  borrador: "pending",
  finalizado: "finished",
};

function formatFecha(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatEventoRango(
  inicio: string | null,
  fin: string | null
): string {
  const fi = formatFecha(inicio);
  const ff = formatFecha(fin);
  if (fi && ff && fi !== ff) return `${fi} – ${ff}`;
  return fi ?? ff ?? "Fechas por definir";
}

/** Publicado de cara al público (misma regla que la administración del evento). */
export function isEventoPublicado(estado: TorneoExpressEvento["estado"]): boolean {
  return (
    estado === "published" || estado === "in_progress" || estado === "completed"
  );
}

function initials(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");
}

const EventoFlyer: React.FC<{ nombre: string; flyerUrl: string | null }> = ({
  nombre,
  flyerUrl,
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = flyerUrl?.trim() || null;

  if (!url || failedUrl === url) {
    return (
      <div className="te-ev-card__media te-ev-card__media--empty">
        <span className="te-ev-card__initials" aria-hidden>
          {initials(nombre)}
        </span>
        <span className="te-ev-card__media-hint">Sin flyer</span>
      </div>
    );
  }

  return (
    <div className="te-ev-card__media">
      {/* Fondo difuminado decorativo: rellena el área sin recortar el flyer. */}
      <img
        className="te-ev-card__media-bg"
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
      />
      <img
        className="te-ev-card__flyer"
        src={url}
        alt={`Flyer de ${nombre}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(url)}
      />
    </div>
  );
};

export type EventoListaCardProps = {
  evento: TorneoExpressEvento;
  categoriaCount: number;
  temporal: EventoTemporalEstado;
  deleting: boolean;
  onManage: () => void;
  onDelete: () => void;
};

export const EventoListaCard: React.FC<EventoListaCardProps> = ({
  evento,
  categoriaCount,
  temporal,
  deleting,
  onManage,
  onDelete,
}) => {
  const publicado = isEventoPublicado(evento.estado);
  const canViewPublic = Boolean(evento.slug) && publicado;

  const menuItems: TeActionMenuItem[] = [];
  if (canViewPublic) {
    menuItems.push({
      id: "public",
      label: "Ver página pública",
      href: `/eventos/${evento.slug}`,
      external: true,
    });
  }
  menuItems.push({
    id: "delete",
    label: "Eliminar evento",
    danger: true,
    disabled: deleting,
    separatorBefore: canViewPublic,
    onSelect: onDelete,
  });

  const titleId = `te-ev-card-${evento.id}-title`;

  return (
    <li
      className={`te-ev-card te-ev-card--${temporal}`}
      aria-labelledby={titleId}
    >
      <div className="te-ev-card__visual">
        <EventoFlyer nombre={evento.nombre} flyerUrl={evento.flyer_url} />
        <Badge
          variant={BADGE_BY_TEMPORAL[temporal]}
          className="te-ev-card__state"
        >
          {EVENTO_TEMPORAL_LABEL[temporal]}
        </Badge>
      </div>

      <div className="te-ev-card__body">
        <h3 id={titleId} className="te-ev-card__title" title={evento.nombre}>
          {evento.nombre}
        </h3>
        <ul className="te-ev-card__meta">
          <li>
            <TablerIcon name="calendar-event" size={16} />
            <span>{formatEventoRango(evento.fecha_inicio, evento.fecha_fin)}</span>
          </li>
          <li>
            <TablerIcon name="layout-grid" size={16} />
            <span>
              {categoriaCount === 1 ? "1 categoría" : `${categoriaCount} categorías`}
            </span>
          </li>
          <li>
            <TablerIcon name={publicado ? "world" : "eye-off"} size={16} />
            <span>{publicado ? "Publicado" : "Sin publicar"}</span>
          </li>
        </ul>
      </div>

      <footer className="te-ev-card__footer">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="te-ev-card__manage"
          onClick={onManage}
        >
          Gestionar evento
        </Button>
        <TeActionMenu
          label={`Más acciones de ${evento.nombre}`}
          items={menuItems}
        />
      </footer>
    </li>
  );
};
