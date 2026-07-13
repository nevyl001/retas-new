import React from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { TorneoExpressTorneosSection } from "./TorneoExpressTorneosSection";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-inicio-page.css";
import "./te-fondos.css";
import "./te-eventos.css";

/**
 * Lista de Torneos Express sueltos (una categoría, sin evento_id).
 * Paralelo a EventosLista para multi-categoría.
 */
export const TorneosExpressLista: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();

  return (
    <TePageShell className="te-inicio-page te-eventos-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            ← Volver a Torneos
          </Button>
        </ActionBar>

        <div className="te-inicio-page__intro">
          <ModeHeader
            className="te-inicio-header te-header rv-mode-header rv-mode-header--entry"
            eyebrow={modeEyebrow}
            title="Torneo Express"
            subtitle="Torneos de una sola categoría (sin Evento). Cada uno se gestiona por separado."
          />
        </div>

        <div className="te-eventos-toolbar">
          <Button
            type="button"
            variant="primary"
            onClick={() => navigateTorneoExpress("/torneo-express/nuevo")}
          >
            Crear torneo
          </Button>
        </div>

        <TorneoExpressTorneosSection listMode />
      </div>
    </TePageShell>
  );
};
