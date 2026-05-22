import React from "react";
import { StandingsDifCell } from "../standings/StandingsDifCell";
import { StandingsPtsCell } from "../standings/StandingsPtsCell";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import { StandingsTableHeader } from "../standings/StandingsTableHeader";
import {
  COL_CON,
  COL_ENTITY,
  COL_FAV,
  COL_PG,
  COL_PJ,
  COL_POS,
  COL_PP,
  TABLA_RANKING_CLASS,
  TABLA_WRAPPER_CLASS,
} from "../standings/standingsTableColumns";
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
      <div className={`te-standings-wrap ${TABLA_WRAPPER_CLASS}`}>
        <table className={`te-standings-table ${TABLA_RANKING_CLASS}`}>
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
              <tr key={`${row.grupoId}-${row.parejaId}`}>
                <td className={COL_POS}>
                  <span
                    className={`te-standings-pos__badge${
                      index === 0 ? " te-standings-pos__badge--lead" : ""
                    }`}
                  >
                    {index + 1}°
                  </span>
                </td>
                <td className={`te-cell-name ${COL_ENTITY}`}>
                  {row.parejaLabel}
                </td>
                {showGrupoColumn && (
                  <td>
                    <GrupoBadge nombre={row.grupoNombre} orden={row.grupoOrden} />
                  </td>
                )}
                <td className={COL_PJ}>{row.pj}</td>
                <td className={COL_PG}>{row.pg}</td>
                <td className={COL_PP}>{row.pp}</td>
                <td className={COL_FAV}>{row.ptsFav}</td>
                <td className={COL_CON}>{row.ptsCon}</td>
                <StandingsDifCell
                  ptsFav={row.ptsFav}
                  ptsCon={row.ptsCon}
                  className=""
                />
                <StandingsPtsCell pts={row.puntos} className="te-standings-pts" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
