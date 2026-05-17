import React from "react";
import "../../styles/standings-table-mobile.css";
import {
  COL_CON,
  COL_DIF,
  COL_ENTITY,
  COL_FAV,
  COL_PG,
  COL_PJ,
  COL_POS,
  COL_PP,
  COL_PTS,
} from "./standingsTableColumns";
import {
  STANDINGS_ENTITY_HEADERS,
  STANDINGS_PTS_TABLE_TITLE,
  type StandingsEntityColumn,
} from "./standingsTableConfig";

interface StandingsTableHeaderProps {
  entity: StandingsEntityColumn;
  /** Columnas extra entre entidad y PJ (p. ej. Grupo en torneo express). */
  middleColumns?: React.ReactNode;
}

export const StandingsTableHeader: React.FC<StandingsTableHeaderProps> = ({
  entity,
  middleColumns,
}) => {
  const entityHeader = STANDINGS_ENTITY_HEADERS[entity];
  return (
    <tr>
      <th className={COL_POS} title="Posición">
        POS
      </th>
      <th className={COL_ENTITY} title={entityHeader.title}>
        {entityHeader.label}
      </th>
      {middleColumns}
      <th className={COL_PJ} title="Partidos jugados">
        PJ
      </th>
      <th className={COL_PG} title="Partidos ganados">
        PG
      </th>
      <th className={COL_PP} title="Partidos perdidos">
        PP
      </th>
      <th className={COL_FAV} title="Juegos anotados a favor">
        FAV
      </th>
      <th className={COL_CON} title="Juegos recibidos en contra">
        CON
      </th>
      <th className={COL_DIF} title="Diferencia (FAV − CON)">
        DIF
      </th>
      <th className={COL_PTS} title={STANDINGS_PTS_TABLE_TITLE}>
        PTS
      </th>
    </tr>
  );
};
