import React, { useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TorneoExpressTorneosSection } from "./TorneoExpressTorneosSection";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import "./te-inicio-page.css";
import "./te-fondos.css";

export const TorneoExpressInicio: React.FC = () => {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <TePageShell className="te-inicio-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
            ← Volver al inicio
          </Button>
        </ActionBar>

        <div className="te-inicio-page__intro">
          <ModeHeader
            className="te-inicio-header te-header rv-mode-header rv-mode-header--entry"
            eyebrow="Riviera Open"
            title="Torneo Express"
            subtitle="Grupos y round robin por grupo. Crea, gestiona y lanza tus torneos en minutos."
          />
        </div>

        <TorneoExpressTorneosSection refreshToken={refreshToken} />

        <section
          className="te-inicio-crear te-inicio-crear__shell"
          aria-labelledby="te-crear-section-heading"
        >
          <h2 id="te-crear-section-heading" className="te-inicio-crear__title rv-section-title">
            Crear nuevo torneo
          </h2>

          <CrearTorneoExpress
            onTorneoCreated={() => setRefreshToken((n) => n + 1)}
          />
        </section>
      </div>
    </TePageShell>
  );
};
