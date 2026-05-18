import React from "react";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./torneo-express.css";
import "./riviera-torneo-express.css";

/** Acceso desde el dashboard principal sin tocar la lógica de retas. */
export const TorneoExpressEntry: React.FC = () => {
  return (
    <div
      className="torneo-express-card"
      style={{ marginBottom: "var(--space-lg, 1.5rem)" }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.15rem", color: "var(--te-gold)" }}>
        Torneo Express por Grupos
      </h2>
      <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary, #9ca3af)", fontSize: "0.9rem" }}>
        Crea grupos, asigna parejas de una reta y genera partidos round robin con tabla pública en tiempo real.
      </p>
      <button
        type="button"
        className="torneo-express-btn torneo-express-btn--primary"
        onClick={() => navigateTorneoExpress("/torneo-express")}
      >
        Ir a Torneo Express
      </button>
    </div>
  );
};
