import React from "react";
import { TablaGrupo } from "./TablaGrupo";
import type {
  StandingRowExpress,
  TorneoExpressClasificacionModo,
} from "../../lib/torneoExpress/types";

export const TablaGeneral: React.FC<{
  rows: StandingRowExpress[];
  clasificacionModo?: TorneoExpressClasificacionModo;
}> = ({ rows, clasificacionModo }) => {
  return (
    <TablaGrupo
      rows={rows}
      showGrupoColumn
      scoringHelpVariant="express"
      clasificacionModo={clasificacionModo}
    />
  );
};
