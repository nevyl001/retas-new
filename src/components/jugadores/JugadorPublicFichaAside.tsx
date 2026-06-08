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
  retas: number;
  torneosExpress: number;
  victorias: number;
  partidosPerdidos: number;
  winRate: number | null;
  recent: HistorialItemView[];
}

export const JugadorPublicFichaAside: React.FC<JugadorPublicFichaAsideProps> = ({
  retas,
  torneosExpress,
  victorias,
  partidosPerdidos,
  winRate,
  recent,
}) => {
  const tieneDuelos = victorias > 0 || partidosPerdidos > 0;

  return (
    <aside className="rjp-ficha-aside" aria-label="Resumen y actividad">
      <div className="rjp-ficha-aside__kpis">
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Retas</span>
          <span
            className={`rjp-ficha-kpi__val${
              retas === 0 ? " rjp-ficha-kpi__val--empty" : ""
            }`}
          >
            {retas}
          </span>
          <span className="rjp-ficha-kpi__hint">
            {retas === 0
              ? "Sin actividad aún"
              : "Retas, americanos, ligas y más"}
          </span>
        </div>
        <div className="rjp-ficha-kpi rjp-ficha-kpi--torneo">
          <span className="rjp-ficha-kpi__lbl">Torneos</span>
          <span
            className={`rjp-ficha-kpi__val${
              torneosExpress === 0 ? " rjp-ficha-kpi__val--empty" : ""
            }`}
          >
            {torneosExpress}
          </span>
          <span className="rjp-ficha-kpi__hint">
            {torneosExpress === 0
              ? "Se registra al finalizar"
              : "Participaciones"}
          </span>
        </div>
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Victorias</span>
          <span
            className={`rjp-ficha-kpi__val${
              victorias === 0 ? " rjp-ficha-kpi__val--empty" : ""
            }`}
          >
            {victorias}
          </span>
          <span className="rjp-ficha-kpi__hint">
            {!tieneDuelos
              ? "Sin partidos registrados"
              : partidosPerdidos > 0
                ? `${victorias} ganados · ${partidosPerdidos} perdidos`
                : "Partidos ganados"}
          </span>
        </div>
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Efectividad</span>
          <span
            className={`rjp-ficha-kpi__val${
              winRate == null ? " rjp-ficha-kpi__val--empty" : ""
            }`}
          >
            {winRate != null ? `${winRate}%` : "—"}
          </span>
          <span className="rjp-ficha-kpi__hint">
            {winRate == null
              ? "Sin duelos decididos"
              : "% victorias en partidos"}
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
