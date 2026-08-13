import React from "react";
import { CrearTorneoExpress } from "./CrearTorneoExpress";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
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

        <section
          className="te-inicio-crear te-inicio-crear__shell te-inicio-crear--categoria"
          aria-labelledby="te-evento-cat-crear-heading"
        >
          <header className="te-inicio-crear__intro">
            <h1
              id="te-evento-cat-crear-heading"
              className="te-inicio-crear__title rv-section-title"
            >
              Agregar categoría
            </h1>
            <p className="te-inicio-crear__sub">
              Se vincula a este evento: parejas, grupos y partidos.
            </p>
          </header>
          <CrearTorneoExpress
            eventoId={eventoId}
            returnToEventoAfterCreate
          />
        </section>
      </div>
    </TePageShell>
  );
};
