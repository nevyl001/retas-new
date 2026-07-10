import React from "react";
import type { RankingEvolutionPoint } from "../../lib/rivieraJugadores/historialDisplay";
import { formatHistorialFecha } from "../../lib/rivieraJugadores/historialDisplay";
import "./RankingEvolutionChart.css";

interface RankingEvolutionChartProps {
  points: RankingEvolutionPoint[];
}

export const RankingEvolutionChart: React.FC<RankingEvolutionChartProps> = ({
  points,
}) => {
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.puntosAcumulados), 1);
  const ultimo = points[points.length - 1];

  return (
    <section className="rjp-evolution" aria-label="Evolución de puntos Riviera">
      <header className="rjp-evolution__head">
        <h2 className="rjp-evolution__title">Evolución de puntos</h2>
        <p className="rjp-evolution__sub">
          {ultimo.puntosAcumulados.toLocaleString("es-MX")} pts en{" "}
          {points.length} eventos con puntos
        </p>
      </header>

      <div
        className="rjp-evolution__chart"
        role="img"
        aria-label={`Progresión de ${points[0].puntosAcumulados} a ${ultimo.puntosAcumulados} puntos`}
      >
        {points.map((p, i) => {
          const heightPct = Math.max(8, Math.round((p.puntosAcumulados / max) * 100));
          return (
            <div key={`${p.fecha}-${i}`} className="rjp-evolution__col">
              <div
                className="rjp-evolution__bar"
                style={{ height: `${heightPct}%` }}
                title={`${p.eventoNombre}: +${p.delta} pts (${formatHistorialFecha(p.fecha)})`}
              />
              <span className="rjp-evolution__label">{formatHistorialFecha(p.fecha)}</span>
            </div>
          );
        })}
      </div>

      <ul className="rjp-evolution__recent">
        {points
          .slice(-3)
          .reverse()
          .map((p, i) => (
            <li key={`${p.fecha}-recent-${i}`} className="rjp-evolution__item">
              <span className="rjp-evolution__item-name">{p.eventoNombre}</span>
              <span className="rjp-evolution__item-delta">+{p.delta}</span>
            </li>
          ))}
      </ul>
    </section>
  );
};
