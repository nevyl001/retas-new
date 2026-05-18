import React, { useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TorneoExpressTorneosSection } from "./TorneoExpressTorneosSection";
import "./torneo-express.css";
import "./riviera-torneo-express.css";

export const TorneoExpressInicio: React.FC = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="torneo-express-page te-inicio-page">
      <div className="te-inicio-toolbar riviera-back-toolbar">
        <button
          type="button"
          className="riviera-btn-back"
          onClick={() => navigateToAppHome()}
        >
          ← Volver al inicio
        </button>
      </div>

      <TorneoExpressTorneosSection refreshToken={refreshToken} />

      <div className="te-section-divider" role="separator">
        <span>── Crear nuevo torneo express ──</span>
      </div>

      <CrearTorneoExpress
        onTorneoCreated={() => setRefreshToken((n) => n + 1)}
      />
    </div>
  );
};
