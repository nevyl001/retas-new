import React from "react";
import { computeDueloScore } from "../../lib/duelo2v2/scoring";
import type { Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
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
}

function renderPair(
  label: string,
  players: PublicRetaWinnerAvatar[],
  isWinner: boolean
) {
  return (
    <div
      className={`duelo2v2-celebrate__pair${
        isWinner ? " duelo2v2-celebrate__pair--winner" : ""
      }`}
    >
      <p className="duelo2v2-celebrate__pair-label">
        {label}
        {isWinner ? " · Ganadores" : ""}
      </p>
      <div className="duelo2v2-celebrate__pair-players">
        {players.map((p) => (
          <div key={p.name} className="duelo2v2-celebrate__player">
            <div className="duelo2v2-celebrate__player-ring">
              <JugadorAvatar
                fotoUrl={p.fotoUrl}
                nombre={p.name}
                size="xl"
                className="duelo2v2-celebrate__player-avatar"
              />
            </div>
            <span className="duelo2v2-celebrate__player-name">{p.name}</span>
          </div>
        ))}
      </div>
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
}) => {
  const summary = computeDueloScore(detalle);
  const ganadorA = ganador === "a";

  return (
    <section
      className="duelo2v2-celebrate ro-pub-celebrate ro-pub-celebrate--winners te-pub-fade-in"
      aria-label="Ganadores del duelo 2 vs 2"
    >
      <div className="ro-pub-celebrate__glow" aria-hidden />
      <div className="ro-pub-celebrate__inner">
        <PublicRivieraCelebrateBrand showTagline={false} />

        <p className="ro-pub-celebrate__badge">Ganadores</p>
        <h2 className="ro-pub-celebrate__headline">¡Felicidades!</h2>

        <div className="duelo2v2-celebrate__pairs">
          {renderPair(teamAName, teamA, ganadorA)}
          <div className="duelo2v2-celebrate__pairs-vs" aria-hidden>
            VS
          </div>
          {renderPair(teamBName, teamB, !ganadorA)}
        </div>

        <div className="duelo2v2-celebrate__scoreboard">
          <div className="duelo2v2-celebrate__score-main">
            <span
              className={`duelo2v2-celebrate__score-team${
                ganadorA ? " duelo2v2-celebrate__score-team--winner" : ""
              }`}
            >
              {teamAName}
            </span>
            <div className="duelo2v2-celebrate__score-numbers">
              <strong>{setsA}</strong>
              <span className="duelo2v2-celebrate__score-dash">–</span>
              <strong>{setsB}</strong>
            </div>
            <span
              className={`duelo2v2-celebrate__score-team${
                !ganadorA ? " duelo2v2-celebrate__score-team--winner" : ""
              }`}
            >
              {teamBName}
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
            {summary.gamesTotalA}–{summary.gamesTotalB} juegos totales
          </p>
        </div>

        <p className="ro-pub-celebrate__motivational">
          {finalizado
            ? "¡Victoria confirmada! Sumaron puntos al ranking Riviera Open."
            : "¡Gran duelo! Se llevan la victoria en este encuentro."}
        </p>
        <p className="ro-pub-celebrate__rank">Ganadores del duelo 2 vs 2</p>
        <PublicRivieraCelebrateClosing torneoNombre={torneoNombre} />

        <p className="ro-pub-celebrate__participantes-note">
          Gracias a todas las parejas por participar y seguir escribiendo su
          historia en Riviera Open.
        </p>
      </div>
    </section>
  );
};
