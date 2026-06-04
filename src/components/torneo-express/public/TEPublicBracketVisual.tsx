import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPublicBracketVisualLayout,
  type BracketVisualColumn,
  type BracketVisualSlot,
} from "../../../lib/torneoExpress/publicBracketLayout";
import { isRondaTercerLugar } from "../../../lib/torneoExpress/bracketRounds";
import type {
  PublicBracketTeam,
  PublicMatchStatus,
  PublicMatchupCard,
} from "../../../lib/torneoExpress/publicBracketModel";
import type { PartidoSetScore } from "../../../lib/torneoExpress/types";
import { detectMatchWinner } from "../../../lib/torneoExpress/partidoSets";

function statusLabel(status: PublicMatchStatus): string {
  switch (status) {
    case "live":
      return "EN JUEGO";
    case "finished":
      return "JUGADO";
    case "bye":
      return "BYE";
    default:
      return "PENDIENTE";
  }
}

function cardVisualPhase(
  card: PublicMatchupCard,
  isCenter: boolean
): "octavos" | "cuartos" | "semifinal" | "final" {
  const label = card.roundLabel.toLowerCase();
  if (label.includes("tercer")) return "final";
  if (isCenter) return "final";
  if (label.includes("octavo")) return "octavos";
  if (label.includes("cuarto")) return "cuartos";
  if (label.includes("semi")) return "semifinal";
  return "cuartos";
}

function BracketSideMeta({ card }: { card: PublicMatchupCard }) {
  const hora = formatFinalTime(card.horaDisplay, card.scheduleMs);
  const cancha = formatFinalCourt(card.canchaLabel);

  return (
    <div className="te-bracket-side-meta" aria-label="Horario y cancha">
      <div className="te-bracket-side-meta__item">
        <span className="te-bracket-side-meta__label">Horario</span>
        <span className="te-bracket-side-meta__value te-bracket-side-meta__value--time">
          {hora}
        </span>
      </div>
      <div className="te-bracket-side-meta__item">
        <span className="te-bracket-side-meta__label">Cancha</span>
        <span className="te-bracket-side-meta__value">{cancha}</span>
      </div>
    </div>
  );
}

function formatFinalDateParts(
  scheduleMs: number | null
): { weekday: string; date: string } {
  if (scheduleMs == null) {
    return { weekday: "Por confirmar", date: "" };
  }
  try {
    const d = new Date(scheduleMs);
    const weekday = d
      .toLocaleDateString("es-MX", { weekday: "long" })
      .replace(/^\w/, (c) => c.toUpperCase());
    const date = d.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
    });
    return { weekday, date };
  } catch {
    return { weekday: "Por confirmar", date: "" };
  }
}

function formatFinalTime(horaDisplay: string, scheduleMs: number | null): string {
  if (scheduleMs != null) {
    try {
      return new Date(scheduleMs).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      /* fall through */
    }
  }
  const time = horaDisplay.replace(/\s*p\.?\s*m\.?/gi, "").trim();
  return time || "Por confirmar";
}

function formatFinalCourt(cancha: string | null): string {
  if (!cancha?.trim()) return "Por confirmar";
  return cancha.replace(/^cancha\s*/i, "Cancha ");
}

function BracketFinalSchedule({ card }: { card: PublicMatchupCard }) {
  const { weekday, date } = formatFinalDateParts(card.scheduleMs);
  const hora = formatFinalTime(card.horaDisplay, card.scheduleMs);
  const cancha = formatFinalCourt(card.canchaLabel);

  return (
    <div className="te-bracket-final-schedule" aria-label="Programación de la final">
      <div className="te-bracket-final-schedule__item">
        <span className="te-bracket-final-schedule__label">Fecha</span>
        <span className="te-bracket-final-schedule__value te-bracket-final-schedule__value--date">
          <span className="te-bracket-final-schedule__date-line">{weekday}</span>
          {date ? (
            <span className="te-bracket-final-schedule__date-line">{date}</span>
          ) : null}
        </span>
      </div>
      <div className="te-bracket-final-schedule__item te-bracket-final-schedule__item--time">
        <span className="te-bracket-final-schedule__label">Horario</span>
        <span className="te-bracket-final-schedule__value te-bracket-final-schedule__value--time">
          {hora}
        </span>
      </div>
      <div className="te-bracket-final-schedule__item">
        <span className="te-bracket-final-schedule__label">Cancha</span>
        <span className="te-bracket-final-schedule__value">{cancha}</span>
      </div>
    </div>
  );
}

function BracketSetsList({
  sets,
  layout = "inline",
}: {
  sets: PartidoSetScore[];
  layout?: "inline" | "aligned";
}) {
  if (sets.length === 0) return null;

  if (layout === "aligned") {
    return (
      <div
        className="te-bracket-sets te-bracket-sets--aligned"
        aria-label="Marcador por sets"
      >
        <ul className="te-bracket-sets__list te-bracket-sets__list--aligned">
          {sets.map((set, i) => {
            const localWonSet = set.local > set.visitante;
            const visitWonSet = set.visitante > set.local;
            return (
              <li key={i} className="te-bracket-sets__aligned-row">
                <span className="te-bracket-sets__aligned-label">
                  Set {i + 1}
                </span>
                <span
                  className={`te-bracket-sets__aligned-num te-bracket-sets__aligned-num--top${
                    localWonSet ? " te-bracket-sets__num--accent" : ""
                  }`}
                >
                  {set.local}
                </span>
                <span
                  className={`te-bracket-sets__aligned-num te-bracket-sets__aligned-num--bottom${
                    visitWonSet ? " te-bracket-sets__num--accent" : ""
                  }`}
                >
                  {set.visitante}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="te-bracket-sets" aria-label="Marcador por sets">
      <p className="te-bracket-sets__label" aria-hidden>
        Sets
      </p>
      <ul className="te-bracket-sets__list">
        {sets.map((set, i) => {
          const localWonSet = set.local > set.visitante;
          const visitWonSet = set.visitante > set.local;

          const localClass = localWonSet ? " te-bracket-sets__num--accent" : "";
          const visitClass = visitWonSet ? " te-bracket-sets__num--accent" : "";

          return (
            <li key={i} className="te-bracket-sets__row">
              <span className="te-bracket-sets__set-name">Set {i + 1}:</span>
              <span className="te-bracket-sets__score">
                <span className={`te-bracket-sets__num${localClass}`}>
                  {set.local}
                </span>
                <span className="te-bracket-sets__sep" aria-hidden>
                  –
                </span>
                <span className={`te-bracket-sets__num${visitClass}`}>
                  {set.visitante}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function bracketWinnerFlags(card: PublicMatchupCard, played: boolean) {
  if (!played) {
    return { localWins: false, visitWins: false };
  }
  const fromSets = detectMatchWinner(card.sets);
  if (fromSets === "local") {
    return { localWins: true, visitWins: false };
  }
  if (fromSets === "visitante") {
    return { localWins: false, visitWins: true };
  }
  return {
    localWins: card.local.isWinner,
    visitWins: card.visit.isWinner,
  };
}

function BracketTeamRow({
  team,
  role,
  centered = false,
}: {
  team: PublicBracketTeam;
  role: "winner" | "loser" | "neutral";
  centered?: boolean;
}) {
  const isWinner = role === "winner";

  return (
    <div
      className={`te-bracket-team te-bracket-team--${role}${
        isWinner ? " te-bracket-team--winner" : ""
      }${centered ? " te-bracket-team--centered" : ""}`}
    >
      <div className="te-bracket-team__main">
        {team.seed != null ? (
          <span className="te-bracket-team__seed">#{team.seed}</span>
        ) : null}
        <span className="te-bracket-team__name">{team.label}</span>
        {team.originBadge ? (
          <span className="te-bracket-origin">{team.originBadge}</span>
        ) : null}
      </div>
      {isWinner ? (
        <span className="te-bracket-team__dot" aria-hidden title="Ganador" />
      ) : null}
    </div>
  );
}

function BracketMatchCard({
  card,
  isCenter = false,
}: {
  card: PublicMatchupCard;
  isCenter?: boolean;
}) {
  const played = card.status === "finished";
  const { localWins, visitWins } = bracketWinnerFlags(card, played);
  const hasSets = played && card.sets.length > 0;

  const localRole: "winner" | "loser" | "neutral" = played
    ? localWins
      ? "winner"
      : visitWins
        ? "loser"
        : "neutral"
    : "neutral";
  const visitRole: "winner" | "loser" | "neutral" = played
    ? visitWins
      ? "winner"
      : localWins
        ? "loser"
        : "neutral"
    : "neutral";

  const phaseLabel = isCenter
    ? "FINAL"
    : isRondaTercerLugar(card.ronda)
      ? "TERCER LUGAR"
      : card.matchTitle.toUpperCase();
  const visualPhase = cardVisualPhase(card, isCenter);
  const localPending = !card.local.label?.trim();
  const visitPending = !card.visit.label?.trim();

  const renderFinalPending = () => (
    <>
      <span
        className={`te-elim-bracket-finalist${
          localPending ? " te-elim-bracket-finalist--pending" : ""
        }`}
      >
        {card.local.label?.trim() || "Por definir"}
      </span>
      <span className="te-bracket-vs te-bracket-vs--final">
        <span className="te-bracket-vs__line" aria-hidden />
        <span className="te-bracket-vs__text">vs</span>
        <span className="te-bracket-vs__line" aria-hidden />
      </span>
      <span
        className={`te-elim-bracket-finalist${
          visitPending ? " te-elim-bracket-finalist--pending" : ""
        }`}
      >
        {card.visit.label?.trim() || "Por definir"}
      </span>
    </>
  );

  return (
    <article
      className={`te-elim-bracket-card te-elim-bracket-card--${card.status}${
        isCenter ? " te-elim-bracket-card--center" : ""
      }`}
      data-bracket-card={
        isCenter ? "final" : isRondaTercerLugar(card.ronda) ? "tercer" : "side"
      }
      data-bracket-phase={visualPhase}
      aria-label={`${card.matchTitle}: ${card.local.label} vs ${card.visit.label}`}
    >
      <header
        className={`te-elim-bracket-card__head${
          isCenter ? " te-elim-bracket-card__head--center" : ""
        }`}
      >
        <span
          className={`te-elim-bracket-card__phase${
            isCenter ? " te-elim-bracket-card__phase--final" : ""
          }`}
        >
          {phaseLabel}
        </span>
        <span
          className={`te-elim-bracket-card__status te-elim-bracket-card__status--${card.status}`}
        >
          {statusLabel(card.status)}
        </span>
      </header>

      {!isCenter ? (
        <BracketSideMeta card={card} />
      ) : (
        <BracketFinalSchedule card={card} />
      )}

      <div
        className={`te-elim-bracket-card__body${
          isCenter ? " te-elim-bracket-card__body--final" : ""
        }`}
      >
        {isCenter && !played ? (
          renderFinalPending()
        ) : played && (localWins || visitWins) ? (
          <>
            <BracketTeamRow
              team={card.local}
              role={localRole}
              centered={isCenter}
            />
            {hasSets ? (
              <BracketSetsList sets={card.sets} layout="aligned" />
            ) : null}
            <BracketTeamRow
              team={card.visit}
              role={visitRole}
              centered={isCenter}
            />
          </>
        ) : (
          <>
            <BracketTeamRow team={card.local} role="neutral" centered={isCenter} />
            <span className="te-bracket-vs">
              <span className="te-bracket-vs__line" aria-hidden />
              <span className="te-bracket-vs__text">vs</span>
              <span className="te-bracket-vs__line" aria-hidden />
            </span>
            <BracketTeamRow
              team={card.visit}
              role="neutral"
              centered={isCenter}
            />
          </>
        )}
      </div>
    </article>
  );
}

function BracketFinalPlaceholderCard({
  slot,
}: {
  slot: BracketVisualSlot;
}) {
  const top = slot.finalistTop ?? "Por definir";
  const bottom = slot.finalistBottom ?? "Por definir";
  const topPending = top === "Por definir";
  const bottomPending = bottom === "Por definir";

  return (
    <article
      className="te-elim-bracket-card te-elim-bracket-card--center te-elim-bracket-card--placeholder te-elim-bracket-card--pending"
      data-bracket-card="final"
      aria-label="Final"
    >
      <header className="te-elim-bracket-card__head te-elim-bracket-card__head--center">
        <span className="te-elim-bracket-card__phase te-elim-bracket-card__phase--final">
          FINAL
        </span>
        <span className="te-elim-bracket-card__status te-elim-bracket-card__status--pending">
          PENDIENTE
        </span>
      </header>

      <div className="te-elim-bracket-card__body te-elim-bracket-card__body--final">
        <span
          className={`te-elim-bracket-finalist${
            topPending ? " te-elim-bracket-finalist--pending" : ""
          }`}
        >
          {top}
        </span>
        <span className="te-bracket-vs te-bracket-vs--final">
          <span className="te-bracket-vs__line" aria-hidden />
          <span className="te-bracket-vs__text">vs</span>
          <span className="te-bracket-vs__line" aria-hidden />
        </span>
        <span
          className={`te-elim-bracket-finalist${
            bottomPending ? " te-elim-bracket-finalist--pending" : ""
          }`}
        >
          {bottom}
        </span>
      </div>
    </article>
  );
}

function BracketFinalCaption({
  categoria,
  showThirdPlace = false,
}: {
  categoria: string | null;
  showThirdPlace?: boolean;
}) {
  const categoryLine = showThirdPlace
    ? categoria
      ? `Final y tercer lugar · ${categoria.toUpperCase()}`
      : "Final y tercer lugar"
    : categoria
      ? `Final · ${categoria.toUpperCase()}`
      : "Gran final";

  return (
    <header className="te-bracket-final-caption" aria-label={categoryLine}>
      <div className="te-bracket-final-caption__ornament" aria-hidden>
        <span className="te-bracket-final-caption__line" />
        <span className="te-bracket-final-caption__diamond" />
        <span className="te-bracket-final-caption__line" />
      </div>
      <p className="te-bracket-final-caption__brand">
        RIVIERA
        <span className="te-bracket-final-caption__brand-sep" aria-hidden>
          {" "}
          ·{" "}
        </span>
        OPEN
      </p>
      <p className="te-bracket-final-caption__title">{categoryLine}</p>
    </header>
  );
}

function BracketSlotView({
  slot,
  categoria,
  inFinaleStack = false,
}: {
  slot: BracketVisualSlot;
  categoria: string | null;
  inFinaleStack?: boolean;
}) {
  const isCenter = Boolean(slot.isCenter);
  const content =
    slot.kind === "final-placeholder" || !slot.card ? (
      <BracketFinalPlaceholderCard slot={slot} />
    ) : (
      <BracketMatchCard card={slot.card} isCenter={isCenter} />
    );

  if (isCenter && !inFinaleStack) {
    return (
      <div className="te-bracket-final-wrap">
        <BracketFinalCaption categoria={categoria} />
        {content}
      </div>
    );
  }

  return content;
}

function BracketColumn({
  column,
  categoria,
}: {
  column: BracketVisualColumn;
  categoria: string | null;
}) {
  const hasFinaleStack =
    column.side === "center" &&
    column.slots.some(
      (s) => s.card != null && isRondaTercerLugar(s.card.ronda)
    );

  if (hasFinaleStack) {
    return (
      <div
        className="te-bracket-col te-bracket-col--center"
        data-col="center"
      >
        <div className="te-bracket-final-wrap te-bracket-final-wrap--duo">
          <BracketFinalCaption categoria={categoria} showThirdPlace />
          <div className="te-bracket-col__stack te-bracket-col__stack--finale">
            {column.slots.map((slot, i) => (
              <BracketSlotView
                key={`${column.index}-${i}-${slot.card?.id ?? "ph"}`}
                slot={slot}
                categoria={categoria}
                inFinaleStack
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`te-bracket-col te-bracket-col--${column.side}`}
      data-col={column.side}
    >
      <div className="te-bracket-col__stack">
        {column.slots.map((slot, i) => (
          <BracketSlotView
            key={`${column.index}-${i}-${slot.card?.id ?? "ph"}`}
            slot={slot}
            categoria={categoria}
          />
        ))}
      </div>
    </div>
  );
}

interface ConnectorPaths {
  left: string;
  right: string;
}

function BracketConnectorOverlay({
  stageRef,
  leftHasWinner,
  rightHasWinner,
  enabled,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  leftHasWinner: boolean;
  rightHasWinner: boolean;
  enabled: boolean;
}) {
  const [paths, setPaths] = useState<ConnectorPaths>({ left: "", right: "" });

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !enabled) {
      setPaths({ left: "", right: "" });
      return;
    }

    const leftCard = stage.querySelector<HTMLElement>(
      '[data-col="left"] [data-bracket-card="side"]'
    );
    const finalCard = stage.querySelector<HTMLElement>(
      '[data-col="center"] [data-bracket-card="final"]'
    );
    const rightCard = stage.querySelector<HTMLElement>(
      '[data-col="right"] [data-bracket-card="side"]'
    );

    if (!leftCard || !finalCard || !rightCard) {
      setPaths({ left: "", right: "" });
      return;
    }

    const sr = stage.getBoundingClientRect();
    const lr = leftCard.getBoundingClientRect();
    const fr = finalCard.getBoundingClientRect();
    const rr = rightCard.getBoundingClientRect();

    const leftY = lr.top + lr.height / 2 - sr.top;
    const leftX = lr.right - sr.left;
    const finalLeftX = fr.left - sr.left;
    const finalRightX = fr.right - sr.left;
    const finalY = fr.top + fr.height / 2 - sr.top;
    const rightY = rr.top + rr.height / 2 - sr.top;
    const rightX = rr.left - sr.left;

    setPaths({
      left: `M ${leftX} ${leftY} L ${finalLeftX} ${finalY}`,
      right: `M ${rightX} ${rightY} L ${finalRightX} ${finalY}`,
    });
  }, [enabled, stageRef]);

  useEffect(() => {
    measure();
    const stage = stageRef.current;
    if (!stage || !enabled) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(stage);
    const cards = stage.querySelectorAll("[data-bracket-card]");
    cards.forEach((el) => ro.observe(el));

    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure, stageRef]);

  if (!enabled || (!paths.left && !paths.right)) return null;

  return (
    <svg className="te-bracket-connectors" aria-hidden>
      {paths.left ? (
        <path
          d={paths.left}
          className={`te-bracket-connectors__path${
            leftHasWinner ? " te-bracket-connectors__path--active" : ""
          }`}
        />
      ) : null}
      {paths.right ? (
        <path
          d={paths.right}
          className={`te-bracket-connectors__path${
            rightHasWinner ? " te-bracket-connectors__path--active" : ""
          }`}
        />
      ) : null}
    </svg>
  );
}

export interface TEPublicBracketVisualProps {
  allCards: PublicMatchupCard[];
  totalRondas: number;
  activeRonda?: number;
  categoria?: string | null;
}

export const TEPublicBracketVisual: React.FC<TEPublicBracketVisualProps> = ({
  allCards,
  totalRondas,
  activeRonda,
  categoria = null,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(
    () => buildPublicBracketVisualLayout(allCards, totalRondas, activeRonda),
    [allCards, totalRondas, activeRonda]
  );

  const sideHasWinner = useCallback((card: PublicMatchupCard) => {
    if (card.status !== "finished") return false;
    const w = detectMatchWinner(card.sets);
    if (w === "local" || w === "visitante") return true;
    return card.local.isWinner || card.visit.isWinner;
  }, []);

  const leftHasWinner = useMemo(
    () =>
      layout.columns
        .find((c) => c.side === "left")
        ?.slots.some((s) => s.card && sideHasWinner(s.card)) ?? false,
    [layout.columns, sideHasWinner]
  );

  const rightHasWinner = useMemo(
    () =>
      layout.columns
        .find((c) => c.side === "right")
        ?.slots.some((s) => s.card && sideHasWinner(s.card)) ?? false,
    [layout.columns, sideHasWinner]
  );

  const showConnectors = layout.columnCount > 1;

  if (allCards.length === 0) {
    return (
      <p className="te-elim-public-empty">
        Aún no hay enfrentamientos publicados.
      </p>
    );
  }

  return (
    <>
      <div
        ref={stageRef}
        className="te-bracket-stage te-bracket-visual te-bracket-visual--desktop te-pub-fade-in"
      >
        <div className="te-bracket-visual__grid">
          {layout.columns.map((col) => (
            <BracketColumn
              key={`col-${col.index}`}
              column={col}
              categoria={categoria}
            />
          ))}
        </div>
        <BracketConnectorOverlay
          stageRef={stageRef}
          leftHasWinner={leftHasWinner}
          rightHasWinner={rightHasWinner}
          enabled={showConnectors}
        />
      </div>

      <div className="te-bracket-visual te-bracket-visual--mobile te-pub-fade-in">
        {layout.mobileSlots.map((slot, i) => (
          <React.Fragment key={`m-${i}-${slot.card?.id ?? "ph"}`}>
            {i > 0 ? (
              <div className="te-bracket-mobile-arrow" aria-hidden>
                ↓
              </div>
            ) : null}
            <BracketSlotView slot={slot} categoria={categoria} />
          </React.Fragment>
        ))}
      </div>
    </>
  );
};
