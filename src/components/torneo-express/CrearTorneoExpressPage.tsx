import React from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-inicio-page.css";
import "./te-fondos.css";

/** Contenedor de `/torneo-express/nuevo`: torneo suelto (sin evento). */
export const CrearTorneoExpressPage: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();

  return (
    <TePageShell className="te-inicio-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            ← Volver
          </Button>
        </ActionBar>

        <div className="te-inicio-page__intro">
          <ModeHeader
            className="te-inicio-header te-header rv-mode-header rv-mode-header--entry"
            eyebrow={modeEyebrow}
            title="Crear torneo"
            subtitle="Torneo suelto: una sola categoría, sin Evento. Parejas, grupos y partidos como siempre."
          />
        </div>

        <section
          className="te-inicio-crear te-inicio-crear__shell"
          aria-labelledby="te-crear-page-heading"
        >
          <h2
            id="te-crear-page-heading"
            className="te-inicio-crear__title rv-section-title"
          >
            Datos del torneo
          </h2>
          <CrearTorneoExpress />
        </section>
      </div>
    </TePageShell>
  );
};
