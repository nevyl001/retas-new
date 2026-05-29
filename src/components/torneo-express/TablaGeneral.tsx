import React from "react";
import { TablaGrupo } from "./TablaGrupo";
import type { StandingRowExpress } from "../../lib/torneoExpress/types";

export const TablaGeneral: React.FC<{ rows: StandingRowExpress[] }> = ({
  rows,
}) => {
  return <TablaGrupo rows={rows} showGrupoColumn scoringHelpVariant="express" />;
};
