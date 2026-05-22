import React, { useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TorneoExpressTorneosSection } from "./TorneoExpressTorneosSection";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";

export const TorneoExpressInicio: React.FC = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <TePageShell className="te-inicio-page">
      <div className="te-inicio-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          ← Volver al inicio
        </Button>
      </div>

      <TorneoExpressTorneosSection refreshToken={refreshToken} />

      <div className="te-section-divider" role="separator">
        <span>── Crear nuevo torneo express ──</span>
      </div>

      <CrearTorneoExpress
        onTorneoCreated={() => setRefreshToken((n) => n + 1)}
      />
    </TePageShell>
  );
};
