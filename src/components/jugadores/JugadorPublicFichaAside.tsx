import React from "react";
import type { HistorialItemView } from "../../lib/rivieraJugadores/historialDisplay";
import { TablerIcon } from "../ui/TablerIcon";

function formatFechaCorta(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

interface JugadorPublicFichaAsideProps {
  torneos: number;
  victorias: number;
  winRate: number | null;
  recent: HistorialItemView[];
}

export const JugadorPublicFichaAside: React.FC<JugadorPublicFichaAsideProps> = ({
  torneos,
  victorias,
  winRate,
  recent,
}) => {
  const sinDatos = torneos === 0;

  return (
    <aside className="rjp-ficha-aside" aria-label="Resumen y actividad">
      <div className="rjp-ficha-aside__kpis">
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Torneos</span>
          <span className="rjp-ficha-kpi__val">{torneos}</span>
          <span className="rjp-ficha-kpi__hint">
            {sinDatos ? "Sin registros" : "Participaciones"}
          </span>
        </div>
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Victorias</span>
          <span className="rjp-ficha-kpi__val">{victorias}</span>
          <span className="rjp-ficha-kpi__hint">
            {sinDatos ? "Sin registros" : "Resultado victoria"}
          </span>
        </div>
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Win rate</span>
          <span
            className={`rjp-ficha-kpi__val${
              winRate == null ? " rjp-ficha-kpi__val--empty" : ""
            }`}
          >
            {winRate != null ? `${winRate}%` : "—"}
          </span>
          <span className="rjp-ficha-kpi__hint">
            {winRate == null ? "Sin datos" : "Victorias / decididos"}
          </span>
        </div>
      </div>

      <section className="rjp-ficha-card rjp-ficha-activity">
        <h2 className="rjp-ficha-activity__title">
          <TablerIcon name="activity" size={14} />
          Actividad reciente
        </h2>
        <ul className="rjp-ficha-activity__list">
          {recent.length === 0 ? (
            <>
              {[0, 1, 2].map((i) => (
                <li key={i} className="rjp-ficha-activity__row rjp-ficha-activity__row--empty">
                  <span>Sin actividad registrada</span>
                  <span>—</span>
                </li>
              ))}
            </>
          ) : (
            recent.map((it) => (
              <li key={it.id} className="rjp-ficha-activity__row">
                <div className="rjp-ficha-activity__text">
                  <span className="rjp-ficha-activity__event">{it.eventoNombre}</span>
                  <span className="rjp-ficha-activity__meta">
                    {it.modalidadLabel} · {formatFechaCorta(it.fecha)}
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
            ))
          )}
        </ul>
      </section>
    </aside>
  );
};
