import React from "react";
import { GrupoBadge } from "./GrupoBadge";
import type { StandingRowExpress } from "../../lib/torneoExpress/types";

interface TablaGrupoProps {
  rows: StandingRowExpress[];
  showGrupoColumn?: boolean;
}

export const TablaGrupo: React.FC<TablaGrupoProps> = ({
  rows,
  showGrupoColumn = false,
}) => {
  return (
    <div className="te-standings-wrap">
      <table className="te-standings-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Pareja</th>
            {showGrupoColumn && <th>Grupo</th>}
            <th>PJ</th>
            <th>PG</th>
            <th>PP</th>
            <th>Pts Fav</th>
            <th>Pts Con</th>
            <th>Dif</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.grupoId}-${row.parejaId}`}
              className={index === 0 ? "te-row-top" : undefined}
            >
              <td>{index + 1}</td>
              <td className="te-cell-name">{row.parejaLabel}</td>
              {showGrupoColumn && (
                <td>
                  <GrupoBadge nombre={row.grupoNombre} orden={row.grupoOrden} />
                </td>
              )}
              <td>{row.pj}</td>
              <td>{row.pg}</td>
              <td>{row.pp}</td>
              <td>{row.ptsFav}</td>
              <td>{row.ptsCon}</td>
              <td>{row.dif}</td>
              <td>{row.puntos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
