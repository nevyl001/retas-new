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
import {
  criterionHeaderClass,
  type StandingsCriterionOrder,
} from "../../utils/standingsCriterionHighlight";
import "../../styles/standings-criterion.css";

interface StandingsTableHeaderProps {
  entity: StandingsEntityColumn;
  /** Columnas extra entre entidad y PJ (p. ej. Grupo en torneo express). */
  middleColumns?: React.ReactNode;
  /** Orden de criterios en superíndices (default = americano). */
  criterionOrder?: StandingsCriterionOrder;
}

export const StandingsTableHeader: React.FC<StandingsTableHeaderProps> = ({
  entity,
  middleColumns,
  criterionOrder = "americano",
}) => {
  const entityHeader = STANDINGS_ENTITY_HEADERS[entity];
  const isExpress = criterionOrder === "express";

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
      <th
        className={`${COL_PG} ${criterionHeaderClass("pg", criterionOrder)}`}
        title={
          isExpress
            ? "Partidos ganados (1.er criterio)"
            : "Partidos ganados (3.er criterio de desempate)"
        }
      >
        PG
      </th>
      <th className={COL_PP} title="Partidos perdidos">
        PP
      </th>
      <th
        className={`${COL_FAV} ${criterionHeaderClass("fav", criterionOrder)}`}
        title={
          isExpress
            ? "Juegos a favor (2.º criterio)"
            : "Juegos a favor (1.er criterio)"
        }
      >
        FAV
      </th>
      <th className={COL_CON} title="Juegos recibidos en contra">
        CON
      </th>
      <th
        className={`${COL_DIF} ${criterionHeaderClass("dif", criterionOrder)}`}
        title={
          isExpress
            ? "Diferencia FAV − CON (3.er criterio)"
            : "Diferencia FAV − CON (2.º criterio)"
        }
      >
        DIF
      </th>
      <th
        className={`${COL_PTS} standings-col-informative`}
        title={STANDINGS_PTS_TABLE_TITLE}
      >
        PTS
      </th>
    </tr>
  );
};
