import React from "react";
import {
  getDueloLoserCelebrateMessage,
  getDueloWinnerCelebrateMessage,
  getOrganizerCelebrateParticipantesNote,
  useBranding,
} from "../../club-experience";
import { computeDueloScore } from "../../lib/duelo2v2/scoring";
import type { Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import type { RatingMovimientoPartido } from "../../lib/rivieraJugadores/types";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import {
  PublicRivieraCelebrateBrand,
  PublicRivieraCelebrateClosing,
} from "../public/PublicRivieraCelebrateBrand";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";

interface Duelo2v2CelebrateSectionProps {
  teamAName: string;
  teamBName: string;
  teamA: PublicRetaWinnerAvatar[];
  teamB: PublicRetaWinnerAvatar[];
  ganador: "a" | "b";
  setsA: number;
  setsB: number;
  detalle: Duelo2v2SetDetalle[];
  torneoNombre: string;
  finalizado: boolean;
  ratingByJugadorId?: Record<string, RatingMovimientoPartido>;
}

function RatingMoveBadge({ move }: { move: RatingMovimientoPartido }) {
  const up = move.delta >= 0;
  return (
    <span
      className={`duelo2v2-celebrate__rating-move duelo2v2-celebrate__rating-move--${
        up ? "up" : "down"
      }`}
      aria-label={`Nivel ${up ? "subió" : "bajó"} ${Math.abs(move.delta).toFixed(2)}`}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {move.delta.toFixed(2)} · {move.ratingDespues.toFixed(2)}
    </span>
  );
}

function TeamPlayers({
  players,
  ratingByJugadorId,
  winnerRing,
}: {
  players: PublicRetaWinnerAvatar[];
  ratingByJugadorId?: Record<string, RatingMovimientoPartido>;
  winnerRing?: boolean;
}) {
  return (
    <div className="duelo2v2-celebrate__pair-players">
      {players.map((p) => {
        const move =
          p.jugadorId && ratingByJugadorId
            ? ratingByJugadorId[p.jugadorId]
            : undefined;
        return (
          <div key={p.jugadorId ?? p.name} className="duelo2v2-celebrate__player">
            <div
              className={`duelo2v2-celebrate__player-ring${
                winnerRing ? " duelo2v2-celebrate__player-ring--winner" : ""
              }`}
            >
              <JugadorAvatar
                fotoUrl={p.fotoUrl}
                nombre={p.name}
                size="xl"
                className="duelo2v2-celebrate__player-avatar"
              />
            </div>
            <span className="duelo2v2-celebrate__player-name">{p.name}</span>
            {move ? <RatingMoveBadge move={move} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export const Duelo2v2CelebrateSection: React.FC<Duelo2v2CelebrateSectionProps> = ({
  teamAName,
  teamBName,
  teamA,
  teamB,
  ganador,
  setsA,
  setsB,
  detalle,
  torneoNombre,
  finalizado,
  ratingByJugadorId,
}) => {
  const { nombre: organizerName } = useBranding();
  const summary = computeDueloScore(detalle);
  const ganadorA = ganador === "a";
  const hasRating = Boolean(
    ratingByJugadorId && Object.keys(ratingByJugadorId).length > 0
  );

  const winners = ganadorA ? teamA : teamB;
  const losers = ganadorA ? teamB : teamA;
  const winnersName = ganadorA ? teamAName : teamBName;
  const losersName = ganadorA ? teamBName : teamAName;
  const setsWin = ganadorA ? setsA : setsB;
  const setsLoss = ganadorA ? setsB : setsA;
  const gamesWin = ganadorA ? summary.gamesTotalA : summary.gamesTotalB;
  const gamesLoss = ganadorA ? summary.gamesTotalB : summary.gamesTotalA;

  const winnerMessage = getDueloWinnerCelebrateMessage(
    finalizado,
    hasRating,
    organizerName
  );

  const loserMessage = getDueloLoserCelebrateMessage(
    finalizado,
    hasRating,
    organizerName
  );

  return (
    <section
      className="duelo2v2-celebrate ro-pub-celebrate ro-pub-celebrate--winners te-pub-fade-in"
      aria-label="Resultado del duelo 2 vs 2"
    >
      <div className="ro-pub-celebrate__glow" aria-hidden />
      <div className="ro-pub-celebrate__inner">
        <PublicRivieraCelebrateBrand showTagline={false} />

        <div className="duelo2v2-celebrate__outcome-cards">
          <article className="duelo2v2-celebrate__team-card duelo2v2-celebrate__team-card--winner">
            <p className="duelo2v2-celebrate__team-card-badge">Ganadores</p>
            <h2 className="duelo2v2-celebrate__team-card-headline">¡Felicidades!</h2>
            <p className="duelo2v2-celebrate__team-card-names">{winnersName}</p>

            <TeamPlayers
              players={winners}
              ratingByJugadorId={ratingByJugadorId}
              winnerRing
            />

            <div className="duelo2v2-celebrate__team-card-score">
              <div className="duelo2v2-celebrate__team-card-score-main">
                <span className="duelo2v2-celebrate__team-card-score-winner">
                  {winnersName}
                </span>
                <div className="duelo2v2-celebrate__score-numbers">
                  <strong>{setsWin}</strong>
                  <span className="duelo2v2-celebrate__score-dash">–</span>
                  <strong>{setsLoss}</strong>
                </div>
                <span className="duelo2v2-celebrate__team-card-score-rival">
                  {losersName}
                </span>
              </div>
              <p className="duelo2v2-celebrate__score-caption">Sets ganados</p>

              {detalle.length > 0 && (
                <ul className="duelo2v2-celebrate__sets-list">
                  {detalle.map((row, index) => {
                    const outcome = summary.setOutcomes[index] ?? "incompleto";
                    if (outcome === "incompleto") return null;
                    return (
                      <li key={index}>
                        Set {index + 1}: {row.a}–{row.b}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="duelo2v2-celebrate__games-total">
                {gamesWin}–{gamesLoss} juegos totales
              </p>
            </div>

            <p className="duelo2v2-celebrate__team-card-message duelo2v2-celebrate__team-card-message--winner">
              {winnerMessage}
            </p>
          </article>

          <article className="duelo2v2-celebrate__team-card duelo2v2-celebrate__team-card--loser">
            <p className="duelo2v2-celebrate__team-card-badge duelo2v2-celebrate__team-card-badge--loser">
              Sigue adelante
            </p>
            <h3 className="duelo2v2-celebrate__team-card-subheadline">
              Sigue entrenando, sigue mejorando
            </h3>
            <p className="duelo2v2-celebrate__team-card-names duelo2v2-celebrate__team-card-names--loser">
              {losersName}
            </p>

            <TeamPlayers players={losers} ratingByJugadorId={ratingByJugadorId} />

            <p className="duelo2v2-celebrate__team-card-message duelo2v2-celebrate__team-card-message--loser">
              {loserMessage}
            </p>
          </article>
        </div>

        <PublicRivieraCelebrateClosing torneoNombre={torneoNombre} />

        <p className="ro-pub-celebrate__participantes-note">
          {getOrganizerCelebrateParticipantesNote(organizerName)}
        </p>
      </div>
    </section>
  );
};
