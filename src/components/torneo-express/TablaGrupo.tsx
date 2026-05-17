import React from "react";
import { StandingsDifCell } from "../standings/StandingsDifCell";
import { StandingsPtsCell } from "../standings/StandingsPtsCell";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import { StandingsTableHeader } from "../standings/StandingsTableHeader";
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
    <div className="te-standings-block">
      <StandingsScoringHelp />
      <div className="te-standings-wrap">
        <table className="te-standings-table">
          <thead>
            <StandingsTableHeader
              entity="pareja"
              middleColumns={
                showGrupoColumn ? (
                  <th title="Grupo del torneo">GRUPO</th>
                ) : undefined
              }
            />
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
                <StandingsDifCell
                  ptsFav={row.ptsFav}
                  ptsCon={row.ptsCon}
                  className=""
                />
                <StandingsPtsCell pts={row.puntos} className="" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
