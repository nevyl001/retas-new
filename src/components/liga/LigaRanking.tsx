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
                <td>
                  <span className="liga-ranking-player">
                    <span className="liga-ranking-player__name">
                      {row.nombre}
                    </span>
                    {row.ingreso_jornada_numero ? (
                      <span className="liga-ranking-player__ajuste">
                        Sustituto desde Jornada {row.ingreso_jornada_numero}
                        {row.sustituye_a_nombre
                          ? ` · sustituye a ${row.sustituye_a_nombre}`
                          : ""}
                        {row.puntos_heredados
                          ? ` · ${row.puntos_heredados} pts heredados`
                          : ""}
                      </span>
                    ) : null}
                    {row.puntos_ajuste_motivo ? (
                      <span className="liga-ranking-player__ajuste">
                        Ajuste: {row.puntos_ajuste_motivo}
                      </span>
                    ) : null}
                  </span>
                </td>
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
