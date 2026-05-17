import React from "react";
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
      <th title="Posición">POS</th>
      <th title={entityHeader.title}>{entityHeader.label}</th>
      {middleColumns}
      <th title="Partidos jugados">PJ</th>
      <th title="Partidos ganados">PG</th>
      <th title="Partidos perdidos">PP</th>
      <th title="Juegos anotados a favor">FAV</th>
      <th title="Juegos recibidos en contra">CON</th>
      <th title="Diferencia (FAV − CON)">DIF</th>
      <th title={STANDINGS_PTS_TABLE_TITLE}>PTS</th>
    </tr>
  );
};
