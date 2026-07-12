import React, { useMemo } from "react";
import type { RankingItem } from "../../lib/liga/types";
import { ligaRankingItemToMobileRow } from "../../lib/modePresentation/standingsRowAdapters";
import {
  StandingsMobileCards,
} from "../standings/StandingsMobileCards";
import "../../styles/standings-mobile-cards.css";
import "./liga-page.css";

interface LigaRankingProps {
  rows: RankingItem[];
  title?: string;
}

export const LigaRanking: React.FC<LigaRankingProps> = ({
  rows,
  title = "Ranking",
}) => {
  const mobileRows = useMemo(
    () => rows.map((row) => ligaRankingItemToMobileRow(row)),
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
      <div className="liga-ranking-table-desktop">
        <table className="liga-ranking-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Pts</th>
              <th>Jornadas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.jugador_id}
                className={row.posicion <= 3 ? "liga-ranking-top" : undefined}
              >
                <td>{row.posicion}</td>
                <td>{row.nombre}</td>
                <td>{row.puntos}</td>
                <td>{row.jornadas_jugadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
