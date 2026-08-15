import React, { useMemo } from "react";
import type { PublicMatchupCard } from "../../../lib/torneoExpress/publicBracketModel";
import {
  buildBracketPresentationModel,
  type BracketMatchPresentation,
  type BracketRoundPresentation,
  type BracketTeamPresentation,
} from "../../../lib/torneoExpress/publicBracketPresentation";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import type { PublicRetaPairPlayer } from "../../public/PublicRetaPairSide";
import "../../jugadores/riviera-jugadores.css";

function BracketTeamRow({ team }: { team: BracketTeamPresentation }) {
  if (team.kind === "bye") {
    return (
      <div className="te-pb-team te-pb-team--bye">
        <span className="te-pb-team__dep">BYE</span>
      </div>
    );
  }

  if (team.kind === "dependency") {
    return (
      <div className="te-pb-team te-pb-team--pending">
        <span className="te-pb-team__dep">{team.dependencyLabel}</span>
      </div>
    );
  }

  const playerRows =
    team.players.length > 0
      ? team.players
      : team.names.map((name, index) => ({
          id: `${team.parejaId ?? team.label}-${index + 1}`,
          name,
          fotoUrl: null,
          rating: null,
        }));

  const roleClass = team.isWinner
    ? " te-pb-team--winner"
    : team.isLoser
      ? " te-pb-team--loser"
      : "";

  return (
    <div className={`te-pb-team${roleClass}`}>
      <div className="te-pb-team__body">
        <div className="te-pb-team__meta">
          {team.seed != null ? (
            <span className="te-pb-team__seed">#{team.seed}</span>
          ) : null}
          {team.originLabel ? (
            <span className="te-pb-team__origin">{team.originLabel}</span>
          ) : null}
          {team.isWinner ? (
            <span className="te-pb-team__check" aria-label="Ganador">
              ✓
            </span>
          ) : null}
        </div>
        <div className="te-pb-team__names">
          {playerRows.map((player) => (
            <span
              className="te-pb-team__name"
              key={player.id}
              data-player-id={player.id}
              data-pair-id={team.parejaId ?? undefined}
              data-photo-state={player.fotoUrl ? "provided" : "missing"}
            >
              <JugadorAvatar
                fotoUrl={player.fotoUrl}
                nombre={player.name}
                size="sm"
                className="te-pb-team__avatar te-pb-team__avatar--inline"
              />
              <span className="te-pb-team__player-name">{player.name}</span>
              {player.rating != null ? (
                <span className="te-pb-team__rating">
                  {player.rating.toFixed(2)}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {team.setScores.length > 0 ? (
        <div className="te-pb-team__scores" aria-hidden={team.setScores.length === 0}>
          {team.setScores.map((n, i) => (
            <span key={i} className="te-pb-team__score">
              {n}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BracketMatchCard({
  match,
}: {
  match: BracketMatchPresentation;
}) {
  const ariaTeams = [
    match.local.kind === "dependency"
      ? match.local.dependencyLabel
      : match.local.label || match.local.names.join(" / "),
    match.visit.kind === "dependency"
      ? match.visit.dependencyLabel
      : match.visit.label || match.visit.names.join(" / "),
  ].join(" contra ");

  return (
    <article
      className={`te-pb-match te-pb-match--${match.status}${
        match.isFinal ? " te-pb-match--final" : ""
      }${match.isThirdPlace ? " te-pb-match--third" : ""}${
        match.isPlaceholder ? " te-pb-match--placeholder" : ""
      }`}
      data-match-id={match.id}
      data-ronda={match.ronda}
      data-cruce={match.cruceIndex}
      aria-label={`${match.shortTitle}: ${ariaTeams}. ${match.metaLine}`}
    >
      <header className="te-pb-match__head">
        <div className="te-pb-match__identity">
          <span className="te-pb-match__title">{match.shortTitle}</span>
          {match.status === "live" || match.status === "finished" ? (
            <span
              className={`te-pb-match__status te-pb-match__status--${match.status}`}
            >
              {match.statusLabel}
            </span>
          ) : null}
        </div>

        <div
          className={`te-pb-match__logistics${
            match.courtConfirmed
              ? " te-pb-match__logistics--court-confirmed"
              : " te-pb-match__logistics--court-pending"
          }${
            match.timeConfirmed
              ? " te-pb-match__logistics--time-confirmed"
              : " te-pb-match__logistics--time-pending"
          }`}
        >
          <span className="te-pb-match__time">{match.timeLabel}</span>
          <span className="te-pb-match__logistics-sep" aria-hidden="true">
            ·
          </span>
          <span
            className={`te-pb-match__court${
              match.courtConfirmed
                ? " te-pb-match__court--confirmed"
                : " te-pb-match__court--pending"
            }`}
          >
            {match.courtLabel}
          </span>
        </div>
      </header>

      <div className="te-pb-match__body">
        <BracketTeamRow team={match.local} />
        <div className="te-pb-match__divider" aria-hidden />
        <BracketTeamRow team={match.visit} />
      </div>
    </article>
  );
}

function BracketRoundColumn({
  round,
}: {
  round: BracketRoundPresentation;
}) {
  const isFinal = round.matches.some((match) => match.isFinal);
  const champion = isFinal
    ? round.matches
        .flatMap((match) => [match.local, match.visit])
        .find((team) => team.isWinner)
    : null;

  return (
    <section
      className={`te-pb-round${
        round.isThirdPlace ? " te-pb-round--third" : ""
      }${
        round.matches.some((m) => m.isFinal) ? " te-pb-round--final" : ""
      }${round.isActive ? " te-pb-round--active" : ""}${
        round.isCompleted ? " te-pb-round--completed" : ""
      }`}
      data-round={round.id}
      aria-label={round.title}
    >
      <header className="te-pb-round__head">
        <div>
          <span
            className={`te-pb-round__marker${
              isFinal ? " te-pb-round__marker--final" : ""
            }`}
            aria-hidden
          >
            {isFinal ? "◆" : round.isCompleted ? "✓" : "●"}
          </span>
          <h3 className="te-pb-round__title">
            {isFinal ? "GRAN FINAL" : round.title}
          </h3>
        </div>
        <p className="te-pb-round__summary">
          {round.isThirdPlace
            ? "Partido por el podio"
            : round.isActive
              ? round.matches.some((match) => match.status === "live")
                ? "● EN VIVO"
                : `${round.matches.length} ${
                    round.matches.length === 1 ? "partido" : "partidos"
                  }`
              : round.isCompleted
                ? "✓ COMPLETADO"
                : `${round.matches.length} ${
                    round.matches.length === 1 ? "partido" : "partidos"
                  }`}
        </p>
      </header>
      {champion ? (
        <p className="te-pb-round__champion">
          <span>CAMPEONES</span>
          {champion.names.join(" / ") || champion.label}
        </p>
      ) : null}
      <div className="te-pb-round__stack">
        {round.matches.map((match) => (
          <BracketMatchCard
            key={match.id}
            match={match}
          />
        ))}
      </div>
    </section>
  );
}

function BracketStageDivider() {
  return (
    <div className="te-pb-stage-divider" aria-hidden>
      <span className="te-pb-stage-divider__line" />
      <span className="te-pb-stage-divider__arrow">↓</span>
      <span className="te-pb-stage-divider__line" />
    </div>
  );
}

export interface TEPublicBracketVisualProps {
  allCards: PublicMatchupCard[];
  totalRondas: number;
  activeRonda?: number;
  pairPlayersById?: Record<string, PublicRetaPairPlayer[]>;
}

export const TEPublicBracketVisual: React.FC<TEPublicBracketVisualProps> = ({
  allCards,
  totalRondas,
  activeRonda,
  pairPlayersById = {},
}) => {
  const presentation = useMemo(
    () =>
      buildBracketPresentationModel(
        allCards,
        totalRondas,
        activeRonda,
        pairPlayersById
      ),
    [allCards, totalRondas, activeRonda, pairPlayersById]
  );

  if (allCards.length === 0) {
    return (
      <p className="te-elim-public-empty">
        Aún no hay enfrentamientos publicados.
      </p>
    );
  }

  return (
    <div className="te-pb">
      <div className="te-pb-history" aria-label="Historia de la eliminatoria">
        {presentation.allRounds.map((round, index) => (
          <React.Fragment key={round.id}>
            {index > 0 ? <BracketStageDivider /> : null}
            <section
              className={`te-pb-stage te-pb-stage--${round.id}${
                round.isActive ? " te-pb-stage--active" : ""
              }${round.isCompleted ? " te-pb-stage--completed" : ""}`}
            >
              <BracketRoundColumn round={round} />
            </section>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
