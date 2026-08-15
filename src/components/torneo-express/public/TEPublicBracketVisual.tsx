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

function PlayerRow({
  player,
  parejaId,
  imageLoading,
}: {
  player: BracketTeamPresentation["players"][number];
  parejaId: string | null;
  imageLoading: "eager" | "lazy";
}) {
  return (
    <span
      className="te-pb-team__name"
      aria-label={`Jugador ${player.name}`}
      data-player-id={player.id}
      data-pair-id={parejaId ?? undefined}
      data-photo-state={player.fotoUrl ? "provided" : "missing"}
    >
      <JugadorAvatar
        fotoUrl={player.fotoUrl}
        nombre={player.name}
        size="sm"
        loading={imageLoading}
        className="te-pb-team__avatar te-pb-team__avatar--inline"
      />
      <span className="te-pb-team__player-name">{player.name}</span>
      {player.rating != null ? (
        <span className="te-pb-team__rating">{player.rating.toFixed(2)}</span>
      ) : null}
    </span>
  );
}

function TeamBlock({
  team,
  imageLoading,
}: {
  team: BracketTeamPresentation;
  imageLoading: "eager" | "lazy";
}) {
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
            <PlayerRow
              key={player.id}
              player={player}
              parejaId={team.parejaId}
              imageLoading={imageLoading}
            />
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

function MatchScoreboard({
  match,
  variant = "standard",
  hideLiveStatus = false,
}: {
  match: BracketMatchPresentation;
  variant?: "history" | "standard" | "semifinal" | "final" | "third";
  hideLiveStatus?: boolean;
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
      data-variant={variant}
      aria-label={`${match.shortTitle}: ${ariaTeams}. ${match.metaLine}`}
    >
      <header className="te-pb-match__head">
        <div className="te-pb-match__identity">
          <span className="te-pb-match__title">{match.shortTitle}</span>
          {(match.status === "finished" ||
            (match.status === "live" && !hideLiveStatus)) ? (
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
        <TeamBlock
          team={match.local}
          imageLoading={variant === "history" ? "lazy" : "eager"}
        />
        <div className="te-pb-match__divider" aria-hidden>
          <span>VS</span>
        </div>
        <TeamBlock
          team={match.visit}
          imageLoading={variant === "history" ? "lazy" : "eager"}
        />
      </div>
    </article>
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
      <p className="te-pb-champion-moment__eyebrow">Torneo finalizado</p>
      <h3 className="te-pb-champion-moment__title">CAMPEONES</h3>
      <div className="te-pb-champion-moment__players">
        {players.map((player) => (
          <span
            className="te-pb-champion-moment__player"
            key={player.id}
            aria-label={player.name}
          >
            <JugadorAvatar
              fotoUrl={player.fotoUrl}
              nombre={player.name}
              size="xl"
              loading="eager"
              className="te-pb-champion-moment__avatar"
            />
          </span>
        ))}
      </div>
      <strong className="te-pb-champion-moment__pair">
        {champion.names.join(" / ") || champion.label}
      </strong>
      <p className="te-pb-champion-moment__copy">
        El camino terminó en lo más alto. Felicidades, campeones.
      </p>
    </aside>
  );
}

function BracketRoundColumn({
  round,
  display = "current",
}: {
  round: BracketRoundPresentation;
  display?: "history" | "current";
}) {
  const isFinal = round.isFinalRound || round.matches.some((match) => match.isFinal);
  const pairTeams = round.matches
    .flatMap((match) => [match.local, match.visit])
    .filter((team) => team.kind === "team");
  const champion = isFinal
    ? pairTeams.find((team) => team.isWinner) ?? null
    : null;

  return (
    <section
      className={`te-pb-round${
        round.isThirdPlace ? " te-pb-round--third" : ""
      }${isFinal ? " te-pb-round--final" : ""}${
        round.isSemifinal ? " te-pb-round--semis" : ""
      }${round.isCompleted ? " te-pb-round--completed" : ""}${
        display === "history" ? " te-pb-round--history" : " te-pb-round--current"
      }`}
      data-round={round.id}
      data-display={display}
      aria-label={round.title}
    >
      {champion ? <ChampionMoment champion={champion} /> : null}
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
          {display === "current" && !champion && (round.isSemifinal || isFinal) ? (
            <span className="te-pb-round__eyebrow">
              {isFinal ? "Etapa final" : "Etapa decisiva"}
            </span>
          ) : null}
          <h3 className="te-pb-round__title">
            {champion
              ? "RESULTADO FINAL"
              : isFinal
                ? "GRAN FINAL"
                : round.title === "CUARTOS"
                  ? "CUARTOS DE FINAL"
                  : round.title}
          </h3>
        </div>
        <p className="te-pb-round__summary">
          {round.isThirdPlace
            ? round.isCompleted
              ? "✓ 3.er lugar definido"
              : "Una última batalla por subir al podio."
            : round.isCompleted
              ? display === "history"
                ? round.isSemifinal
                  ? "✓ Semifinales completadas"
                  : "✓ Completados"
                : "✓ Completado"
              : null}
        </p>
      </header>

      {display === "current" && !round.isThirdPlace && !champion ? (
        <div className="te-pb-round__editorial">
          {round.isSemifinal ? (
            <>
              <strong>Felicidades, semifinalistas.</strong>
              <p>
                Ya están entre las mejores parejas del torneo. Un partido más
                los separa de la Gran Final.
              </p>
            </>
          ) : (
            <p>
              {isFinal
                ? "Todo el camino conduce hasta aquí. Es momento de definir a los campeones."
                : round.title === "OCTAVOS"
                  ? "El cuadro está abierto. Cada punto empieza a marcar el camino."
                  : "La competencia sube de nivel. Cada partido acerca a una pareja a la definición."}
            </p>
          )}
        </div>
      ) : null}

      <div className="te-pb-round__stack">
        {round.matches.map((match) => (
          <MatchScoreboard
            key={match.id}
            match={match}
            variant={
              display === "history"
                ? "history"
                : isFinal
                  ? "final"
                  : round.isSemifinal
                    ? "semifinal"
                    : round.isThirdPlace
                      ? "third"
                      : "standard"
            }
            hideLiveStatus={
              display === "current" &&
              round.matches.length > 1 &&
              round.matches.every((entry) => entry.status === "live")
            }
          />
        ))}
      </div>
    </section>
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
    <div className="te-pb te-elim-v2">
      <div className="te-pb-current-stage" aria-label="Etapa actual de la eliminatoria">
        {presentation.visibleRound ? (
          <section
            className={`te-pb-stage te-pb-stage--${presentation.visibleRound.id}`}
            key={presentation.visibleRound.id}
          >
            {presentation.rounds
              .filter((round) => round.ronda < presentation.visibleRound!.ronda)
              .map((round) => (
                <React.Fragment key={round.id}>
                  <BracketRoundColumn round={round} display="history" />
                  <div className="te-pb-stage-progression" aria-hidden>
                    <span />
                    <i>●</i>
                  </div>
                </React.Fragment>
              ))}
            <BracketRoundColumn round={presentation.visibleRound} />
            {presentation.visibleThirdPlace ? (
              <div className="te-pb-current-stage__third">
                <BracketRoundColumn round={presentation.visibleThirdPlace} />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
};
