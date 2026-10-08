import React, { useState } from "react";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import {
  classifyEventoTemporal,
  EVENTO_TEMPORAL_LABEL,
} from "../../lib/torneoExpress/eventoTemporal";
import { Badge, Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import {
  BADGE_BY_TEMPORAL,
  formatEventoRango,
  isEventoPublicado,
} from "./EventoListaCard";
import { TeActionMenu } from "./TeActionMenu";
import "./te-evento-detalle.css";

type EventoDetalleHeaderProps = {
  evento: TorneoExpressEvento;
  categoriaCount: number;
  publishing: boolean;
  onTogglePublish: () => void;
};

function initials(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");
}

/** Miniatura del flyer guardado (contenida, sin recorte). */
const HeaderThumb: React.FC<{ nombre: string; flyerUrl: string | null }> = ({
  nombre,
  flyerUrl,
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = flyerUrl?.trim() || null;
  const showImage = Boolean(url) && failedUrl !== url;
  return (
    <div className="te-evd-head__thumb" aria-hidden={showImage ? undefined : true}>
      {showImage && url ? (
        <img
          src={url}
          alt={`Flyer de ${nombre}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span>{initials(nombre)}</span>
      )}
    </div>
  );
};

export const EventoDetalleHeader: React.FC<EventoDetalleHeaderProps> = ({
  evento,
  categoriaCount,
  publishing,
  onTogglePublish,
}) => {
  const temporal = classifyEventoTemporal(evento);
  const publicado = isEventoPublicado(evento.estado);
  const canTogglePublish =
    evento.estado === "draft" ||
    evento.estado === "published" ||
    evento.estado === "in_progress" ||
    evento.estado === "completed";
  const canViewPublic = Boolean(evento.slug) && publicado;

  return (
    <header className="te-evd-head">
      <div className="te-evd-head__id">
        <HeaderThumb nombre={evento.nombre} flyerUrl={evento.flyer_url} />
        <div className="te-evd-head__text">
          <div className="te-evd-head__title-row">
            <h1 className="te-evd-head__title">{evento.nombre}</h1>
            <Badge variant={BADGE_BY_TEMPORAL[temporal]}>
              {EVENTO_TEMPORAL_LABEL[temporal]}
            </Badge>
          </div>
          <ul className="te-evd-head__meta">
            <li>
              <TablerIcon name="calendar-event" size={16} />
              <span>{formatEventoRango(evento.fecha_inicio, evento.fecha_fin)}</span>
            </li>
            <li>
              <TablerIcon name="clock" size={16} />
              <span>{evento.timezone}</span>
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
            {evento.slug ? (
              <li className="te-evd-head__slug">
                <TablerIcon name="link" size={16} />
                <span>{`/${evento.slug}`}</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {canTogglePublish || canViewPublic ? (
        <div className="te-evd-head__actions">
          {canTogglePublish ? (
            <Button
              type="button"
              variant={evento.estado === "draft" ? "primary" : "secondary"}
              size="sm"
              loading={publishing}
              disabled={publishing}
              onClick={onTogglePublish}
            >
              {evento.estado === "draft" ? "Publicar evento" : "Volver a borrador"}
            </Button>
          ) : null}
          {canViewPublic ? (
            <TeActionMenu
              label="Vista pública del evento"
              triggerLabel="Vista pública"
              align="end"
              items={[
                {
                  id: "public",
                  label: "Ver página pública",
                  href: `/eventos/${evento.slug}`,
                  external: true,
                },
                {
                  id: "live",
                  label: "Pantalla de canchas",
                  href: `/eventos/${evento.slug}/en-vivo`,
                  external: true,
                },
              ]}
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );
};
