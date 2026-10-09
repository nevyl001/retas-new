import React from "react";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import type { PublicMatchupCard } from "../../../lib/torneoExpress/publicBracketModel";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { useTorneoPublicEventoNav } from "../../../hooks/useTorneoPublicDisplayNombre";
import { TEPublicBracketVisual } from "./TEPublicBracketVisual";
import "./te-public-grupos.css";
import "./te-public-eliminatoria.css";
import "./te-public-eliminatoria-v2.css";

export const TEPublicEliminatoriaPreview: React.FC<{
  bundle: TorneoExpressBundle;
  cards: PublicMatchupCard[];
  totalRondas: number;
  gruposHref: string;
  eventoHref?: string | null;
  timeZone?: string | null;
}> = ({ bundle, cards, totalRondas, gruposHref, eventoHref }) => {
  const categoria = formatTorneoExpressCategoria(bundle.torneo.categoria);
  const { displayNombre } = useTorneoPublicEventoNav(bundle.torneo);
  const eventName = displayNombre || bundle.torneo.nombre;

  return (
    <div className="te-grupos-page te-elim-public te-elim-preview">
      <p className="te-elim-schedule-note">
        Todos los horarios son tentativos, de acuerdo con la duración de los
        partidos o el atraso de los mismos. Favor de tomarlo en cuenta. Gracias.
      </p>
      <header className="te-elim-public__header te-pub-fade-in">
        {eventoHref ? (
          <a
            href={eventoHref}
            className="te-grupos-back-evento"
            aria-label="Volver al evento y ver todas las categorías"
          >
            ← Volver al evento
          </a>
        ) : null}
        <div className="te-elim-public__header-top">
          <div>
            <h1 className="te-elim-public__title">
              {categoria ? `${eventName} · ${categoria}` : eventName}
            </h1>
            <p className="te-elim-public__subtitle">
              Cuadro proyectado. Los nombres se publican al cerrar grupos.
            </p>
          </div>
          {gruposHref ? (
            <div className="te-elim-public__actions">
              <a href={gruposHref} className="te-public-phase-nav-link">
                Ver grupos
              </a>
            </div>
          ) : null}
        </div>
      </header>
      <nav className="te-phase-segment" aria-label="Fase del torneo">
        <a className="te-phase-segment__item" href={gruposHref}>
          Grupos
        </a>
        <span
          className="te-phase-segment__item te-phase-segment__item--active"
          aria-current="page"
        >
          Eliminatoria
        </span>
      </nav>
      <section className="te-elim-public-bracket-wrap te-pub-fade-in">
        <TEPublicBracketVisual
          allCards={cards}
          totalRondas={totalRondas}
          activeRonda={1}
          preview
          tournamentName={eventName}
          category={categoria}
        />
      </section>
    </div>
  );
};
