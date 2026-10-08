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

function roundHeading(label: string): string {
  const n = label.toLowerCase();
  if (n.includes("octavo")) return "OCTAVOS DE FINAL";
  if (n.includes("cuarto")) return "CUARTOS DE FINAL";
  if (n.includes("semi")) return "SEMIFINAL";
  if (n.includes("tercer")) return "TERCER LUGAR";
  if (n.includes("final")) return "FINAL";
  return label.toUpperCase();
}

const PreviewMatchCard: React.FC<{
  card: PublicMatchupCard;
  timeZone?: string | null;
}> = ({ card, timeZone }) => {
  const dateLabel = formatPreviewDay(card.scheduleMs, timeZone);
  const timeLabel = card.horaDisplay.trim() || "Por definir";
  return (
    <article className="te-elim-preview-card" aria-label={`${card.matchTitle}`}>
      <header className="te-elim-preview-card__head">
        <span className="te-elim-preview-card__code">
          M{card.cruceIndex + 1}
        </span>
        {dateLabel ? (
          <span className="te-elim-preview-card__date">
            <TablerIcon name="calendar" size={14} />
            {dateLabel}
          </span>
        ) : null}
      </header>
      <div className="te-elim-preview-card__sides">
        <p className="te-elim-preview-card__side">Por definir</p>
        <p className="te-elim-preview-card__side">Por definir</p>
      </div>
      <footer className="te-elim-preview-card__meta">
        <span className="te-elim-preview-card__time">
          <TablerIcon name="clock" size={14} />
          {timeLabel}
        </span>
        {card.canchaLabel ? (
          <span className="te-elim-preview-card__court">{card.canchaLabel}</span>
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
  const rounds = useMemo(() => {
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
      return {
        ronda,
        title: roundHeading(matches[0]?.roundLabel ?? `Ronda ${ronda}`),
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
              Horarios posibles · los clasificados se publican al cerrar grupos
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
      <section
        className="te-elim-preview-tree"
        aria-label={`Cuadro de ${title}`}
      >
        {rounds.map((round) => (
          <div key={round.ronda} className="te-elim-preview-tree__round">
            <h2 className="te-elim-preview-tree__title">{round.title}</h2>
            <div className="te-elim-preview-tree__stack">
              {round.matches.map((card) => (
                <PreviewMatchCard
                  key={card.id}
                  card={card}
                  timeZone={timeZone}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
