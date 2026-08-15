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
  variant = "standard",
}: {
  match: BracketMatchPresentation;
  variant?: "standard" | "semifinal" | "final" | "third";
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
      } te-pb-match--${variant}`}
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

function teamDisplayName(team: BracketTeamPresentation): string {
  if (team.kind === "bye") return "BYE";
  if (team.kind === "dependency") {
    return team.dependencyLabel?.trim() || "Por definir";
  }
  return team.names.join(" / ") || team.label;
}

function BracketCelebrate({
  eyebrow,
  names,
  tone,
}: {
  eyebrow: string;
  names: string[];
  tone: "semi" | "final";
}) {
  if (names.length === 0) return null;
  return (
    <div className={`te-pb-celebrate te-pb-celebrate--${tone}`}>
      <p className="te-pb-celebrate__eyebrow">{eyebrow}</p>
      <ul className="te-pb-celebrate__names">
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}

function ChampionMoment({ champion }: { champion: BracketTeamPresentation }) {
  if (champion.kind !== "team") return null;

  const players =
    champion.players.length > 0
      ? champion.players
      : champion.names.map((name, index) => ({
          id: `${champion.parejaId ?? champion.label}-champion-${index}`,
          name,
          fotoUrl: null,
          rating: null,
        }));

  return (
    <aside className="te-pb-champion-moment" aria-label="Campeones">
      <p className="te-pb-champion-moment__eyebrow">Campeones</p>
      <div className="te-pb-champion-moment__players">
        {players.map((player) => (
          <span className="te-pb-champion-moment__player" key={player.id}>
            <JugadorAvatar
              fotoUrl={player.fotoUrl}
              nombre={player.name}
              size="md"
              className="te-pb-champion-moment__avatar"
            />
            <span>{player.name}</span>
          </span>
        ))}
      </div>
      <p className="te-pb-champion-moment__copy">
        El camino terminó en lo más alto. Felicidades, campeones.
      </p>
    </aside>
  );
}

function DesktopSymmetricalBracket({
  rounds,
}: {
  rounds: BracketRoundPresentation[];
}) {
  const quarterfinals = rounds.find((round) => round.matches.length === 4);
  const semifinals = rounds.find((round) => round.isSemifinal);
  const final = rounds.find((round) => round.isFinalRound);
  const thirdPlace = rounds.find((round) => round.isThirdPlace);

  if (!quarterfinals && !semifinals) return null;

  const champion = final?.matches
    .flatMap((match) => [match.local, match.visit])
    .find((team) => team.kind === "team" && team.isWinner);

  return (
    <div className="te-pb-desktop-tree" aria-label="Cuadro de eliminatoria">
      <div className="te-pb-desktop-tree__header">
        <span>{quarterfinals?.title ?? ""}</span>
        {semifinals ? <span>Semifinales</span> : null}
        {final ? <span>Gran final</span> : null}
      </div>

      {semifinals ? (
        <p className="te-pb-desktop-tree__semis-copy">
          {semifinals.isCompleted
            ? "✓ Semifinales completadas"
            : "Están entre las mejores parejas. Solo un partido los separa de la Gran Final."}
        </p>
      ) : null}

      <div
        className={`te-pb-desktop-tree__grid${
          semifinals ? " te-pb-desktop-tree__grid--has-semis" : ""
        }${final ? " te-pb-desktop-tree__grid--has-final" : ""}`}
      >
        {quarterfinals?.matches.map((match, index) => (
          <div
            className={`te-pb-desktop-tree__node te-pb-desktop-tree__node--qf-${index + 1}`}
            key={match.id}
          >
            <BracketMatchCard match={match} />
          </div>
        ))}

        {semifinals?.matches[0] ? (
          <div className="te-pb-desktop-tree__node te-pb-desktop-tree__node--sf-1">
            <BracketMatchCard match={semifinals.matches[0]} variant="semifinal" />
          </div>
        ) : null}
        {semifinals?.matches[1] ? (
          <div className="te-pb-desktop-tree__node te-pb-desktop-tree__node--sf-2">
            <BracketMatchCard match={semifinals.matches[1]} variant="semifinal" />
          </div>
        ) : null}

        {final?.matches[0] ? (
          <div className="te-pb-desktop-tree__node te-pb-desktop-tree__node--final">
            <p className="te-pb-desktop-tree__editorial">
              Todo el camino conduce hasta aquí. Es momento de definir a los
              campeones.
            </p>
            {champion ? <ChampionMoment champion={champion} /> : null}
            <BracketMatchCard match={final.matches[0]} variant="final" />
          </div>
        ) : null}
      </div>

      {thirdPlace?.matches[0] ? (
        <section className="te-pb-desktop-tree__third">
          <div>
            <p>3.er lugar</p>
            <span>
              {thirdPlace.isCompleted
                ? "✓ 3.er lugar definido"
                : "Una última batalla por subir al podio."}
            </span>
          </div>
          <BracketMatchCard match={thirdPlace.matches[0]} variant="third" />
        </section>
      ) : null}
    </div>
  );
}

function BracketRoundColumn({
  round,
}: {
  round: BracketRoundPresentation;
}) {
  const isFinal = round.isFinalRound || round.matches.some((match) => match.isFinal);
  const isSemisArena = round.isSemifinal && round.matches.length === 2;
  const pairTeams = round.matches
    .flatMap((match) => [match.local, match.visit])
    .filter((team) => team.kind === "team");
  const finalists = isFinal ? pairTeams.map(teamDisplayName) : [];
  const semifinalists = round.isSemifinal
    ? pairTeams.map(teamDisplayName)
    : [];
  const advancing = round.isSemifinal
    ? pairTeams.filter((team) => team.isWinner).map(teamDisplayName)
    : [];
  const champion = isFinal
    ? pairTeams.find((team) => team.isWinner) ?? null
    : null;

  return (
    <section
      className={`te-pb-round${
        round.isThirdPlace ? " te-pb-round--third" : ""
      }${isFinal ? " te-pb-round--final" : ""}${
        round.isSemifinal ? " te-pb-round--semis" : ""
      }${isSemisArena ? " te-pb-round--semis-arena" : ""}${
        round.isActive ? " te-pb-round--active" : ""
      }${round.isCompleted ? " te-pb-round--completed" : ""}`}
      data-round={round.id}
      aria-label={round.title}
    >
      <header className="te-pb-round__head">
        <div>
          <span
            className={`te-pb-round__marker${
              isFinal ? " te-pb-round__marker--final" : ""
            }${round.isSemifinal ? " te-pb-round__marker--semis" : ""}`}
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

      {round.isSemifinal ? (
        <BracketCelebrate
          tone="semi"
          eyebrow="Felicidades a los semifinalistas"
          names={semifinalists}
        />
      ) : null}

      {isFinal ? (
        <BracketCelebrate
          tone="final"
          eyebrow="Felicidades a los finalistas"
          names={finalists}
        />
      ) : null}

      {champion ? (
        <p className="te-pb-round__champion">
          <span>CAMPEONES</span>
          {teamDisplayName(champion)}
        </p>
      ) : null}

      {round.isSemifinal && advancing.length > 0 ? (
        <p className="te-pb-round__advance">
          <span>Clasifican a la Final</span>
          {advancing.join("  ·  ")}
        </p>
      ) : null}

      {isSemisArena ? (
        <div className="te-pb-round__arena" aria-label="Semifinales enfrentadas">
          <div className="te-pb-round__arena-side te-pb-round__arena-side--left">
            <BracketMatchCard match={round.matches[0]} />
          </div>
          <div className="te-pb-round__arena-center" aria-hidden>
            <span className="te-pb-round__arena-rule" />
            <span className="te-pb-round__arena-badge">VS</span>
            <span className="te-pb-round__arena-rule" />
          </div>
          <div className="te-pb-round__arena-side te-pb-round__arena-side--right">
            <BracketMatchCard match={round.matches[1]} />
          </div>
        </div>
      ) : (
        <div className="te-pb-round__stack">
          {round.matches.map((match) => (
            <BracketMatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
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
  const hasDesktopTree = presentation.rounds.some(
    (round) => round.matches.length === 4 || round.isSemifinal
  );

  if (allCards.length === 0) {
    return (
      <p className="te-elim-public-empty">
        Aún no hay enfrentamientos publicados.
      </p>
    );
  }

  return (
    <div className={`te-pb${hasDesktopTree ? " te-pb--has-desktop-tree" : ""}`}>
      <DesktopSymmetricalBracket rounds={presentation.allRounds} />
      <div
        className="te-pb-history"
        aria-label="Historia de la eliminatoria"
      >
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
