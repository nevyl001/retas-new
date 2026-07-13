import React, { useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { navigateToAppHome } from "../../lib/appRouting";
import { CrearEventoModal } from "./CrearEventoModal";
import { TePageShell } from "./TePageShell";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-inicio-page.css";
import "./te-fondos.css";
import "./te-eventos.css";

export const TorneoExpressInicio: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const [createEventoOpen, setCreateEventoOpen] = useState(false);

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
            eyebrow={modeEyebrow}
            title="Torneo"
            subtitle="Grupos y round robin por grupo. Crea un Evento con varias categorías, o un Torneo Express."
          />
        </div>

        <div className="te-inicio-create-actions">
          <section
            className="te-eventos-home-card"
            aria-labelledby="te-eventos-home-title"
          >
            <div className="te-eventos-home-card__copy">
              <h2 id="te-eventos-home-title" className="te-eventos-home-card__title">
                Eventos
              </h2>
              <p className="te-eventos-home-card__sub">
                Varias categorías (4ta, 5ta, Open…) bajo un mismo evento.
              </p>
            </div>
            <div className="te-eventos-home-card__actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigateTorneoExpress("/torneo-express/eventos")}
              >
                Ver eventos
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setCreateEventoOpen(true)}
              >
                Crear evento
              </Button>
            </div>
          </section>

          <section
            className="te-eventos-home-card"
            aria-labelledby="te-torneo-express-home-title"
          >
            <div className="te-eventos-home-card__copy">
              <h2
                id="te-torneo-express-home-title"
                className="te-eventos-home-card__title"
              >
                Torneo Express
              </h2>
              <p className="te-eventos-home-card__sub">
                Una sola categoría. Rápido, igual que siempre.
              </p>
            </div>
            <div className="te-eventos-home-card__actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigateTorneoExpress("/torneo-express/lista")}
              >
                Ver torneos
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => navigateTorneoExpress("/torneo-express/nuevo")}
              >
                Crear torneo
              </Button>
            </div>
          </section>
        </div>
      </div>

      <CrearEventoModal
        open={createEventoOpen}
        onClose={() => setCreateEventoOpen(false)}
        onCreated={(id) => {
          setCreateEventoOpen(false);
          navigateTorneoExpress(`/torneo-express/evento/${id}`);
        }}
      />
    </TePageShell>
  );
};
