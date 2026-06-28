import React, { useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TorneoExpressTorneosSection } from "./TorneoExpressTorneosSection";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import "./te-inicio-page.css";
import "./te-fondos.css";

export const TorneoExpressInicio: React.FC = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <TePageShell className="te-inicio-page">
      <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          ← Volver al inicio
        </Button>
      </ActionBar>

      <TorneoExpressTorneosSection refreshToken={refreshToken} />

      <section
        className="te-inicio-crear"
        aria-labelledby="te-crear-section-heading"
      >
        <h2 id="te-crear-section-heading" className="te-inicio-crear__title rv-section-title">
          <span className="te-inicio-crear__icon" aria-hidden>
            🏆
          </span>
          Crear nuevo torneo
        </h2>

        <CrearTorneoExpress
          onTorneoCreated={() => setRefreshToken((n) => n + 1)}
        />
      </section>
    </TePageShell>
  );
};
