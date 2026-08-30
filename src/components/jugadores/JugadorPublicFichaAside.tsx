import React from "react";
import type { HistorialItemView } from "../../lib/rivieraJugadores/historialDisplay";
import { formatHistorialFecha } from "../../lib/rivieraJugadores/historialDisplay";
import { TablerIcon } from "../ui/TablerIcon";

function formatFechaCorta(iso: string): string {
  const full = formatHistorialFecha(iso);
  return full.replace(/\s+\d{4}$/, "");
}

interface JugadorPublicFichaAsideProps {
  retas: number;
  torneosExpress: number;
  victorias: number;
  partidosPerdidos: number;
  winRate: number | null;
}

export const JugadorPublicFichaAside: React.FC<JugadorPublicFichaAsideProps> = ({
  retas,
  torneosExpress,
  victorias,
  partidosPerdidos,
  winRate,
}) => {
  const tieneDuelos = victorias > 0 || partidosPerdidos > 0;

  return (
    <section className="rjp-ficha-perf" aria-label="Rendimiento">
      <p className="rjp-ficha-section__eyebrow">Rendimiento</p>
      <div className="rjp-ficha-perf__bento">
        <div className="rjp-ficha-perf__cell rjp-ficha-perf__cell--primary">
          <span className="rjp-ficha-perf__lbl">Victorias</span>
          <span
            className={`rjp-ficha-perf__val${
              victorias === 0 ? " rjp-ficha-perf__val--empty" : ""
            }`}
          >
            {victorias}
          </span>
          <span className="rjp-ficha-perf__sub">
            {tieneDuelos
              ? `${victorias}G · ${partidosPerdidos}P`
              : "Sin partidos registrados"}
          </span>
        </div>
        <div className="rjp-ficha-perf__cell rjp-ficha-perf__cell--primary">
          <span className="rjp-ficha-perf__lbl">Efectividad</span>
          <span
            className={`rjp-ficha-perf__val${
              winRate == null ? " rjp-ficha-perf__val--empty" : ""
            }`}
          >
            {winRate != null ? `${winRate}%` : "—"}
          </span>
          <span className="rjp-ficha-perf__sub">
            {winRate == null ? "Sin duelos decididos" : "% victorias en partidos"}
          </span>
        </div>
        <div className="rjp-ficha-perf__cell rjp-ficha-perf__cell--secondary">
          <span className="rjp-ficha-perf__lbl">Participaciones</span>
          <span
            className={`rjp-ficha-perf__val rjp-ficha-perf__val--sm${
              retas === 0 ? " rjp-ficha-perf__val--empty" : ""
            }`}
          >
            {retas}
          </span>
        </div>
        <div className="rjp-ficha-perf__cell rjp-ficha-perf__cell--secondary">
          <span className="rjp-ficha-perf__lbl">Torneos</span>
          <span
            className={`rjp-ficha-perf__val rjp-ficha-perf__val--sm${
              torneosExpress === 0 ? " rjp-ficha-perf__val--empty" : ""
            }`}
          >
            {torneosExpress}
          </span>
        </div>
      </div>
    </section>
  );
};

/** Conservado para tests — ya no se renderiza en la ficha pública (unificado en historial). */
export const JugadorPublicRecentResults: React.FC<{
  recent: HistorialItemView[];
}> = ({ recent }) => {
  return (
    <section
      className="rjp-ficha-activity"
      aria-label="Últimos resultados"
    >
      <h2 className="rjp-ficha-activity__title">
        <TablerIcon name="activity" size={14} />
        Últimos resultados
      </h2>
      {recent.length === 0 ? (
        <p className="rjp-ficha-activity__empty">
          Sin actividad registrada todavía.
        </p>
      ) : (
        <ul className="rjp-ficha-activity__list">
          {recent.slice(0, 3).map((it) => (
            <li key={it.id} className="rjp-ficha-activity__row">
              <div className="rjp-ficha-activity__text">
                <span className="rjp-ficha-activity__event">{it.eventoNombre}</span>
                <span className="rjp-ficha-activity__meta">
                  {formatFechaCorta(it.fecha)}
                  {it.puntos != null && it.puntos > 0
                    ? ` · ${it.puntos} pts`
                    : ""}
                </span>
              </div>
              <span
                className={`rjp-ficha-activity__badge${
                  it.esCampeon
                    ? " rjp-ficha-activity__badge--gold"
                    : it.esSubcampeon
                      ? " rjp-ficha-activity__badge--silver"
                      : ""
                }`}
              >
                {it.lugarLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
