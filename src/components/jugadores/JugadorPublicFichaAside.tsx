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
    <aside className="rjp-ficha-aside" aria-label="Resumen deportivo">
      <section className="rjp-ficha-aside__kpis" aria-label="Indicadores">
        <div className="rjp-ficha-kpi">
          <span className="rjp-ficha-kpi__lbl">Participaciones</span>
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
        <div className="rjp-ficha-kpi">
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
              : "Participaciones TE"}
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
              : `${victorias} ganados · ${partidosPerdidos} perdidos`}
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
      </section>
    </aside>
  );
};

/** Resumen compacto — no compite con Carrera Riviera (máx. 3). */
export const JugadorPublicRecentResults: React.FC<{
  recent: HistorialItemView[];
}> = ({ recent }) => {
  return (
    <section
      className="rjp-ficha-card rjp-ficha-activity rjp-ficha-activity--compact"
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
