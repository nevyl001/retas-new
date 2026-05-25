import React from "react";
import { navigateTorneoExpress } from "./torneoExpressNav";
import { Button } from "../ui";
import "./torneo-express.css";
import "./riviera-torneo-express.css";

/** Acceso desde el dashboard principal sin tocar la lógica de retas. */
export const TorneoExpressEntry: React.FC = () => {
  return (
    <div className="torneo-express-card te-entry-card">
      <h2 className="te-entry-card__title te-label-section">Torneos por grupos</h2>
      <p className="te-entry-card__text">
        Crea grupos, asigna parejas de una reta y genera partidos round robin con
        tabla pública en tiempo real.
      </p>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => navigateTorneoExpress("/torneo-express")}
      >
        Ir a torneos
      </Button>
    </div>
  );
};
