import React, { useMemo } from "react";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import { formatPreviewDay } from "../../../lib/torneoExpress/eliminatoriaPreviewBracket";
import type { PublicMatchupCard } from "../../../lib/torneoExpress/publicBracketModel";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { useTorneoPublicEventoNav } from "../../../hooks/useTorneoPublicDisplayNombre";
import { TablerIcon } from "../../ui/TablerIcon";
import "./te-public-grupos.css";
import "./te-public-eliminatoria.css";
import "./te-public-eliminatoria-v2.css";

type PreviewRound = {
  ronda: number;
  title: string;
  chip: string;
  matches: PublicMatchupCard[];
};

function roundMeta(label: string): { title: string; chip: string } {
  const n = label.toLowerCase();
  if (n.includes("octavo")) {
    return { title: "Octavos de final", chip: "Octavos" };
  }
  if (n.includes("cuarto")) {
    return { title: "Cuartos de final", chip: "Cuartos" };
  }
  if (n.includes("semi")) {
    return { title: "Semifinal", chip: "Semis" };
  }
  if (n.includes("tercer")) {
    return { title: "Tercer lugar", chip: "3.er lugar" };
  }
  if (n.includes("final")) {
    return { title: "Final", chip: "Final" };
  }
  return { title: label, chip: label };
}

function matchHeading(round: PreviewRound, card: PublicMatchupCard): string {
  if (round.matches.length <= 1) {
    return round.title === "Final" ? "Gran final" : round.title;
  }
  return `Partido ${card.cruceIndex + 1}`;
}

function nextMatchHint(
  round: PreviewRound,
  card: PublicMatchupCard,
  nextRound: PreviewRound | undefined
): string | null {
  if (!nextRound) return null;
  if (nextRound.matches.length <= 1) {
    return `El ganador pasa a la ${nextRound.title.toLowerCase()}`;
  }
  const nextMatch = Math.floor(card.cruceIndex / 2) + 1;
  return `El ganador pasa a ${nextRound.chip.toLowerCase()} · partido ${nextMatch}`;
}

const PreviewMatchCard: React.FC<{
  round: PreviewRound;
  card: PublicMatchupCard;
  nextRound?: PreviewRound;
  timeZone?: string | null;
}> = ({ round, card, nextRound, timeZone }) => {
  const dateLabel = formatPreviewDay(card.scheduleMs, timeZone);
  const timeLabel = card.horaDisplay.trim();
  const nextHint = nextMatchHint(round, card, nextRound);
  const heading = matchHeading(round, card);

  return (
    <article className="te-elim-preview-card" aria-label={heading}>
      <header className="te-elim-preview-card__head">
        <h3 className="te-elim-preview-card__code">{heading}</h3>
        <p className="te-elim-preview-card__when">
          {dateLabel ? (
            <span className="te-elim-preview-card__date">
              <TablerIcon name="calendar" size={15} />
              {dateLabel}
            </span>
          ) : null}
          <span className="te-elim-preview-card__time">
            <TablerIcon name="clock" size={15} />
            {timeLabel || "Horario por definir"}
          </span>
        </p>
      </header>
      <div className="te-elim-preview-card__sides">
        <p className="te-elim-preview-card__side">Por definir</p>
        <p className="te-elim-preview-card__vs">vs</p>
        <p className="te-elim-preview-card__side">Por definir</p>
      </div>
      <footer className="te-elim-preview-card__meta">
        {card.canchaLabel ? (
          <span className="te-elim-preview-card__court">
            <TablerIcon name="map-pin" size={15} />
            {card.canchaLabel}
          </span>
        ) : (
          <span className="te-elim-preview-card__court te-elim-preview-card__court--pending">
            Cancha por confirmar
          </span>
        )}
        {nextHint ? (
          <span className="te-elim-preview-card__next">{nextHint}</span>
        ) : null}
      </footer>
    </article>
  );
};

export const TEPublicEliminatoriaPreview: React.FC<{
  bundle: TorneoExpressBundle;
  cards: PublicMatchupCard[];
  totalRondas: number;
  gruposHref: string;
  eventoHref?: string | null;
  timeZone?: string | null;
}> = ({ bundle, cards, totalRondas, gruposHref, eventoHref, timeZone }) => {
  const categoria = formatTorneoExpressCategoria(bundle.torneo.categoria);
  const { displayNombre } = useTorneoPublicEventoNav(bundle.torneo);
  const eventName = displayNombre || bundle.torneo.nombre;
  const title = categoria || bundle.torneo.nombre;
  const rounds = useMemo<PreviewRound[]>(() => {
    const byRound = new Map<number, PublicMatchupCard[]>();
    for (const card of cards) {
      const list = byRound.get(card.ronda) ?? [];
      list.push(card);
      byRound.set(card.ronda, list);
    }
    return Array.from({ length: totalRondas }, (_, index) => {
      const ronda = index + 1;
      const matches = [...(byRound.get(ronda) ?? [])].sort(
        (a, b) => a.cruceIndex - b.cruceIndex
      );
      const meta = roundMeta(matches[0]?.roundLabel ?? `Ronda ${ronda}`);
      return {
        ronda,
        title: meta.title,
        chip: meta.chip,
        matches,
      };
    }).filter((round) => round.matches.length > 0);
  }, [cards, totalRondas]);

  return (
    <div className="te-grupos-page te-elim-public te-elim-preview">
      <header className="te-grupos-hero">
        {eventoHref ? (
          <a
            href={eventoHref}
            className="te-grupos-back-evento"
            aria-label="Volver al evento y ver todas las categorías"
          >
            ← Volver al evento
          </a>
        ) : null}
        <div className="te-grupos-hero__top">
          <div>
            {categoria ? (
              <p className="te-grupos-eyebrow">{eventName}</p>
            ) : null}
            <h1 className="te-grupos-title">{title}</h1>
            <p className="te-grupos-sub">
              Horarios posibles. Los clasificados se publican al cerrar grupos.
            </p>
          </div>
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
      <p className="te-elim-preview-note">
        Este es el orden tentativo de la categoría. Baja para ver cada ronda;
        todavía no hay nombres porque los grupos no han cerrado.
      </p>
      {rounds.length > 1 ? (
        <nav className="te-elim-preview-nav" aria-label="Rondas de la eliminatoria">
          {rounds.map((round) => (
            <a
              key={round.ronda}
              className="te-elim-preview-nav__item"
              href={`#te-elim-preview-r${round.ronda}`}
            >
              {round.chip}
            </a>
          ))}
        </nav>
      ) : null}
      <div className="te-elim-preview-itinerary">
        {rounds.map((round, index) => {
          const nextRound = rounds[index + 1];
          const countLabel =
            round.matches.length === 1
              ? "1 partido"
              : `${round.matches.length} partidos`;
          return (
            <section
              key={round.ronda}
              id={`te-elim-preview-r${round.ronda}`}
              className="te-elim-preview-round"
              aria-labelledby={`te-elim-preview-title-${round.ronda}`}
            >
              <header className="te-elim-preview-round__head">
                <p className="te-elim-preview-round__kicker">Ronda {round.ronda}</p>
                <h2
                  id={`te-elim-preview-title-${round.ronda}`}
                  className="te-elim-preview-round__title"
                >
                  {round.title}
                </h2>
                <p className="te-elim-preview-round__meta">{countLabel}</p>
              </header>
              <div className="te-elim-preview-round__grid">
                {round.matches.map((card) => (
                  <PreviewMatchCard
                    key={card.id}
                    round={round}
                    card={card}
                    nextRound={nextRound}
                    timeZone={timeZone}
                  />
                ))}
              </div>
              {nextRound ? (
                <p className="te-elim-preview-advance">
                  Los ganadores avanzan a {nextRound.title.toLowerCase()}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};
