import React from "react";
import { clasificacionOrderSummary } from "../../../lib/torneoExpress/clasificacionModo";
import type { TorneoExpressClasificacionModo } from "../../../lib/torneoExpress/types";

/** Leyenda compacta para la vista pública de clasificación. */
export const PublicStandingsScoringHelp: React.FC<{
  clasificacionModo?: TorneoExpressClasificacionModo;
}> = ({ clasificacionModo = "dif_puntos" }) => (
  <aside className="te-pub-scoring-help" aria-label="Cómo se calcula la clasificación">
    <p className="te-pub-scoring-help__text">
      Orden: <strong>{clasificacionOrderSummary(clasificacionModo)}</strong> ·
      columna derecha = <strong>DIF</strong>
    </p>
  </aside>
);
