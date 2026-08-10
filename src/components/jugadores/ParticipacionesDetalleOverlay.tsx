import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

type DetalleFiltro = "todos" | string;

/**
 * Drawer/overlay de transparencia pública: "tiene N participaciones porque
 * jugó estos N eventos". El listado cronológico es SIEMPRE la evidencia
 * principal; el calendario es complementario (nunca la única fuente).
 *
 * Se porta a document.body para escapar stacking contexts (p. ej.
 * isolation:isolate del shell) que dejarían el sheet bajo el
 * MobileAppNavigation.
 */
export const ParticipacionesDetalleOverlay: React.FC<
  ParticipacionesDetalleOverlayProps
> = ({ organizadorId, jugador, ym, onClose }) => {
  const [detalle, setDetalle] = useState<ParticipacionDetalleRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<DetalleFiltro>("todos");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFiltroTipo("todos");
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const tiposDisponibles = useMemo(() => {
    if (!detalle) return [] as string[];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of detalle) {
      const t = row.tipo_evento?.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      ordered.push(t);
    }
    return ordered;
  }, [detalle]);

  const detalleFiltrado = useMemo(() => {
    if (!detalle) return [];
    if (filtroTipo === "todos") return detalle;
    return detalle.filter((d) => d.tipo_evento === filtroTipo);
  }, [detalle, filtroTipo]);

  const personaLabel =
    jugador.total_participaciones === 1 ? "participación" : "participaciones";

  return createPortal(
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
            <span className="rjp-part-overlay__summary-pts">
              {jugador.puntos_mes} pts
            </span>
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

              <div className="rjp-part-overlay__list-head">
                <h3 className="rjp-part-overlay__list-title">Detalle cronológico</h3>
                <label className="rjp-part-overlay__filter">
                  <span className="sr-only">Filtrar historial por modalidad</span>
                  <select
                    className="rjp-part-overlay__filter-select"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                    aria-label="Filtrar historial por modalidad"
                  >
                    <option value="todos">
                      Todos ({detalle.length})
                    </option>
                    {tiposDisponibles.map((tipo) => {
                      const count = detalle.filter((d) => d.tipo_evento === tipo).length;
                      return (
                        <option key={tipo} value={tipo}>
                          {participacionTipoEventoLabel(tipo)} ({count})
                        </option>
                      );
                    })}
                  </select>
                  <TablerIcon
                    name="chevron-down"
                    size={16}
                    className="rjp-part-overlay__filter-chev"
                    aria-hidden
                  />
                </label>
              </div>

              {detalleFiltrado.length === 0 ? (
                <p className="rjp-part-overlay__empty">
                  {detalle.length === 0
                    ? "Sin participaciones registradas este mes."
                    : "Sin participaciones para este filtro."}
                </p>
              ) : (
                <ul className="rjp-part-overlay__list">
                  {detalleFiltrado.map((d) => (
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
    </div>,
    document.body
  );
};
