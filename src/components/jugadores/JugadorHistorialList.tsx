import React, { useMemo } from "react";
import {
  groupHistorialResumen,
  participacionToHistorialItem,
} from "../../lib/rivieraJugadores/historialDisplay";
import type {
  JugadorParticipacion,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";

interface JugadorHistorialListProps {
  participaciones: JugadorParticipacion[];
  categoriaFallback?: RivieraJugadorCategoria;
  variant?: "admin" | "public";
  showResumen?: boolean;
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export const JugadorHistorialList: React.FC<JugadorHistorialListProps> = ({
  participaciones,
  categoriaFallback,
  variant = "admin",
  showResumen = true,
}) => {
  const items = useMemo(
    () =>
      participaciones.map((row) =>
        participacionToHistorialItem(row, { categoriaFallback })
      ),
    [participaciones, categoriaFallback]
  );
  const resumen = useMemo(() => groupHistorialResumen(items), [items]);
  const rootClass =
    variant === "public" ? "rj-historial-timeline rj-historial-timeline--public" : "rj-historial-timeline";

  if (items.length === 0) {
    return (
      <p className={variant === "public" ? "rjp-ficha-historial__empty" : "rj-empty"}>
        Sin participaciones registradas aún. El historial se guarda al finalizar
        retas, torneos, ligas o americanos.
      </p>
    );
  }

  return (
    <div className={rootClass}>
      {showResumen && (
        <div className="rj-historial-resumen">
          <div className="rj-historial-resumen__item">
            <strong>{resumen.campeonatos}</strong>
            <span>Campeonatos</span>
          </div>
          <div className="rj-historial-resumen__item">
            <strong>{resumen.subcampeonatos}</strong>
            <span>Subcampeonatos</span>
          </div>
          <div className="rj-historial-resumen__item">
            <strong>{items.length}</strong>
            <span>Eventos</span>
          </div>
        </div>
      )}

      <ul className="rj-historial-timeline__list">
        {items.map((it) => (
          <li key={it.id} className="rj-historial-timeline__item">
            <div className="rj-historial-timeline__icon" aria-hidden>
              {it.modalidadIcon}
            </div>
            <div className="rj-historial-timeline__body">
              <div className="rj-historial-timeline__head">
                <span className="rj-historial-timeline__modalidad">
                  {it.modalidadLabel}
                </span>
                <span
                  className={`rj-historial-timeline__lugar${
                    it.esCampeon
                      ? " rj-historial-timeline__lugar--gold"
                      : it.esSubcampeon
                        ? " rj-historial-timeline__lugar--silver"
                        : ""
                  }`}
                >
                  {it.lugarLabel}
                </span>
              </div>
              <p className="rj-historial-timeline__evento">{it.eventoNombre}</p>
              {it.eventoDescripcion && (
                <p className="rj-historial-timeline__desc">{it.eventoDescripcion}</p>
              )}
              {it.detalle && (
                <p className="rj-historial-timeline__detalle">{it.detalle}</p>
              )}
              <p className="rj-historial-timeline__fecha">
                {formatFecha(it.fecha)}
                {it.puntos != null && it.puntos > 0 && (
                  <span className="rj-historial-timeline__pts">
                    {" "}
                    · {it.puntos.toLocaleString("es-MX")} pts ranking
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
