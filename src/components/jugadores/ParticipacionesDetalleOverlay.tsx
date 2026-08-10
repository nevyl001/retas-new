import React, { useEffect, useState } from "react";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorAvatar } from "./JugadorAvatar";
import { RivieraIdBadge } from "./RivieraIdBadge";
import { ParticipacionesActivityCalendar } from "./ParticipacionesActivityCalendar";
import {
  formatDetalleFechaShort,
  formatYearMonthLong,
  listParticipacionesMensualDetalle,
  participacionTipoEventoLabel,
  type ParticipacionDetalleRow,
  type ParticipacionRankingRow,
  type YearMonth,
} from "../../lib/rivieraJugadores/participacionesMensuales";

interface ParticipacionesDetalleOverlayProps {
  organizadorId: string;
  jugador: ParticipacionRankingRow;
  ym: YearMonth;
  onClose: () => void;
}

/**
 * Drawer/overlay de transparencia pública: "tiene N participaciones porque
 * jugó estos N eventos". El listado cronológico es SIEMPRE la evidencia
 * principal; el calendario es complementario (nunca la única fuente).
 */
export const ParticipacionesDetalleOverlay: React.FC<
  ParticipacionesDetalleOverlayProps
> = ({ organizadorId, jugador, ym, onClose }) => {
  const [detalle, setDetalle] = useState<ParticipacionDetalleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listParticipacionesMensualDetalle(organizadorId, jugador.jugador_id, ym).then(
      (data) => {
        if (cancelled) return;
        if (data === null) {
          setError("No se pudo cargar el detalle de participaciones.");
        } else {
          setDetalle(data);
        }
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [organizadorId, jugador.jugador_id, ym]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const personaLabel =
    jugador.total_participaciones === 1 ? "participación" : "participaciones";

  return (
    <div
      className="rjp-part-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Participaciones de ${jugador.nombre} en ${formatYearMonthLong(ym)}`}
    >
      <button
        type="button"
        className="rjp-part-overlay__backdrop"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="rjp-part-overlay__panel">
        <div className="rjp-part-overlay__header">
          <JugadorAvatar
            fotoUrl={jugador.foto_url}
            nombre={jugador.nombre}
            size="md"
            className="rjp-part-overlay__avatar"
          />
          <div className="rjp-part-overlay__title-block">
            <span className="rjp-part-overlay__name">{jugador.nombre}</span>
            <RivieraIdBadge rivieraId={jugador.riviera_id} embedded />
          </div>
          <button
            type="button"
            className="rjp-part-overlay__close"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            <TablerIcon name="x" size={20} />
          </button>
        </div>

        <div className="rjp-part-overlay__body">
          <p className="rjp-part-overlay__month">{formatYearMonthLong(ym)}</p>
          <p className="rjp-part-overlay__summary">
            <strong>{jugador.total_participaciones}</strong> {personaLabel} ·{" "}
            <strong>{jugador.puntos_mes}</strong> pts
          </p>

          {loading ? (
            <div className="rjp-part-overlay__skeleton" aria-hidden>
              <div className="rjp-sk rjp-sk--row" />
              <div className="rjp-sk rjp-sk--row" />
              <div className="rjp-sk rjp-sk--row" />
            </div>
          ) : null}

          {error ? (
            <p className="rjp-ranking-empty" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && !error && detalle ? (
            <>
              <ParticipacionesActivityCalendar ym={ym} detalle={detalle} />

              <h3 className="rjp-part-overlay__list-title">Detalle cronológico</h3>
              {detalle.length === 0 ? (
                <p className="rjp-part-overlay__empty">
                  Sin participaciones registradas este mes.
                </p>
              ) : (
                <ul className="rjp-part-overlay__list">
                  {detalle.map((d) => (
                    <li key={d.participacion_id} className="rjp-part-overlay__item">
                      <span className="rjp-part-overlay__item-date">
                        {formatDetalleFechaShort(d.fecha)}
                      </span>
                      <div className="rjp-part-overlay__item-body">
                        <span className="rjp-part-overlay__item-evento">
                          {d.evento_nombre?.trim() ||
                            participacionTipoEventoLabel(d.tipo_evento)}
                        </span>
                        <span className="rjp-part-overlay__item-tipo">
                          {participacionTipoEventoLabel(d.tipo_evento)}
                          {d.club_name ? ` · ${d.club_name}` : ""}
                        </span>
                      </div>
                      <span className="rjp-part-overlay__item-pts">
                        +{d.puntos_obtenidos} pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
