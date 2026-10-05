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
  const isExpressSetto = criterionOrder === "express-setto";
  const isDualMeet = criterionOrder === "dual-meet";

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
        className={`${COL_PG}${
          isExpressSetto ? "" : ` ${criterionHeaderClass("pg", criterionOrder)}`
        }`}
        title={
          isExpressSetto
            ? "Partidos ganados. Cada uno vale 2 puntos"
            : "Partidos ganados (3.er criterio de desempate)"
        }
      >
        PG
      </th>
      <th className={COL_PP} title="Partidos perdidos">
        PP
      </th>
      <th
        className={`${COL_FAV}${
          isExpressSetto ? "" : ` ${criterionHeaderClass("fav", criterionOrder)}`
        }`}
        title={
          isExpressSetto
            ? "Games a favor"
            : "Juegos a favor (1.er criterio)"
        }
      >
        FAV
      </th>
      <th
        className={`${COL_CON}${
          isDualMeet ? ` ${criterionHeaderClass("con", criterionOrder)}` : ""
        }`}
        title={
          isDualMeet
            ? "Juegos en contra (2.º criterio: gana quien recibió menos)"
            : "Juegos recibidos en contra"
        }
      >
        CON
      </th>
      <th
        className={`${COL_DIF}${
          isDualMeet
            ? " standings-col-informative"
            : ` ${criterionHeaderClass("dif", criterionOrder)}`
        }`}
        title={
          isDualMeet
            ? "Diferencia FAV − CON (informativo)"
            : isExpressSetto
              ? "Games a favor menos en contra (2.º criterio)"
              : "Diferencia FAV − CON (2.º criterio)"
        }
      >
        DIF
      </th>
      <th
        className={`${COL_PTS}${
          isExpressSetto
            ? " standings-criterion-col standings-criterion-col--rank-1"
            : " standings-col-informative"
        }`}
        title={
          isExpressSetto
            ? "Puntos de tabla: 2 por partido ganado (1.er criterio)"
            : STANDINGS_PTS_TABLE_TITLE
        }
      >
        PTS
      </th>
    </tr>
  );
};
