import React from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-inicio-page.css";
import "./te-eventos.css";

type EventoNuevaCategoriaProps = {
  eventoId: string;
};

/** Reutiliza CrearTorneoExpress dentro del contexto de un Evento. */
export const EventoNuevaCategoria: React.FC<EventoNuevaCategoriaProps> = ({
  eventoId,
}) => {
  const modeEyebrow = useClubModeEyebrow();

  return (
    <TePageShell className="te-inicio-page te-eventos-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() =>
              navigateTorneoExpress(`/torneo-express/evento/${eventoId}`)
            }
          >
            ← Volver al evento
          </Button>
        </ActionBar>

        <div className="te-inicio-page__intro">
          <ModeHeader
            className="te-inicio-header te-header rv-mode-header rv-mode-header--entry"
            eyebrow={modeEyebrow}
            title="Agregar categoría"
            subtitle="Mismo armado de siempre (parejas, grupos, partidos). Al crear se vincula a este evento."
          />
        </div>

        <section
          className="te-inicio-crear te-inicio-crear__shell"
          aria-labelledby="te-evento-cat-crear-heading"
        >
          <h2
            id="te-evento-cat-crear-heading"
            className="te-inicio-crear__title rv-section-title"
          >
            Datos de la categoría
          </h2>
          <CrearTorneoExpress
            eventoId={eventoId}
            returnToEventoAfterCreate
          />
        </section>
      </div>
    </TePageShell>
  );
};
