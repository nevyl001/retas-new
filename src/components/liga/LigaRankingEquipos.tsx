import React, { useMemo } from "react";
import type { LigaEquipoRankingItem } from "../../lib/liga/types";
import { ligaEquipoRankingItemToMobileRow } from "../../lib/modePresentation/standingsRowAdapters";
import { StandingsMobileCards } from "../standings/StandingsMobileCards";
import "../../styles/standings-mobile-cards.css";
import "./liga-page.css";

interface LigaRankingEquiposProps {
  rows: LigaEquipoRankingItem[];
  title?: string;
}

export const LigaRankingEquipos: React.FC<LigaRankingEquiposProps> = ({
  rows,
  title = "Ranking por pareja",
}) => {
  // Fase 2B — solo presentación: mismo `rows` (mismo cálculo, mismo orden)
  // que ya recibe la tabla desktop; el mapeo a StandingsMobileCardRow no
  // reordena ni recalcula nada, solo re-etiqueta los mismos campos.
  const mobileRows = useMemo(
    () => rows.map((row) => ligaEquipoRankingItemToMobileRow(row)),
    [rows]
  );

  if (!rows.length) {
    return (
      <div className="liga-card">
        <h2 className="liga-card__title">{title}</h2>
        <p className="liga-empty">Sin puntos registrados aún.</p>
      </div>
    );
  }

  return (
    <div className="liga-card">
      <h2 className="liga-card__title">{title}</h2>
      <div className="liga-ranking-mobile-cards">
        <StandingsMobileCards rows={mobileRows} />
      </div>
      <div className="liga-ranking-table-desktop liga-ranking-scroll">
        <table className="liga-ranking-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pareja</th>
              <th>PJ</th>
              <th>PG</th>
              <th>PP</th>
              <th>GF</th>
              <th>GC</th>
              <th>DIF</th>
              <th title="Puntos ranking (3/2/0)">PTS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.equipo_id}
                className={row.posicion <= 3 ? "liga-ranking-top" : undefined}
              >
                <td>{row.posicion}</td>
                <td>{row.nombre}</td>
                <td>{row.partidos_jugados}</td>
                <td>{row.partidos_ganados}</td>
                <td>{row.partidos_perdidos}</td>
                <td>{row.games_favor}</td>
                <td>{row.games_contra}</td>
                <td>{row.diferencia_games}</td>
                <td>{row.puntos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
