import React from "react";
import { TePubMatchStatus } from "./tePubShared";

export const PublicRetaMatchCard: React.FC<{
  pair1Label: string;
  pair2Label: string;
  score1: number;
  score2: number;
  hasResult: boolean;
  court: number;
  status: "finished" | "active";
  live?: boolean;
  index: number;
  winnerLabel?: string | null;
  games?: { id: string; pair1: number; pair2: number }[];
}> = ({
  pair1Label,
  pair2Label,
  score1,
  score2,
  hasResult,
  court,
  status,
  live = false,
  index,
  winnerLabel,
  games,
}) => {
  const played = status === "finished" && hasResult;
  const pair1Wins = played && score1 > score2;
  const pair2Wins = played && score2 > score1;

  return (
    <article
      className="te-pub-match te-pub-fade-in-up"
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <TePubMatchStatus
          variant={
            status === "finished"
              ? "finished"
              : live
                ? "live"
                : "pending"
          }
        />
        <span className="te-pub-cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          Cancha {court}
        </span>
      </div>

      <div className="te-pub-match__score-block">
        {hasResult ? (
          <div className="te-pub-score">
            <span
              className={`te-pub-score__num${
                pair1Wins ? " te-pub-score__num--win" : ""
              }`}
            >
              {score1}
            </span>
            <span className="te-pub-score__sep">—</span>
            <span
              className={`te-pub-score__num${
                pair2Wins ? " te-pub-score__num--win" : ""
              }`}
            >
              {score2}
            </span>
          </div>
        ) : (
          <span className="te-pub-score te-pub-score--pending te-pub-score--pending-label">
            Marcador pendiente
          </span>
        )}
      </div>

      <div className="te-pub-match__teams">
        <span
          className={`te-pub-match__team${
            pair1Wins ? " te-pub-match__team--win" : ""
          }`}
        >
          {pair1Label}
        </span>
        <span className="te-pub-match__vs">vs</span>
        <span
          className={`te-pub-match__team${
            pair2Wins ? " te-pub-match__team--win" : ""
          }`}
        >
          {pair2Label}
        </span>
      </div>

      {winnerLabel && (
        <div className="te-pub-match-winner">
          <span className="te-pub-match-winner__icon" aria-hidden>
            🏆
          </span>
          <div className="te-pub-match-winner__body">
            <span className="te-pub-match-winner__label">Ganador</span>
            <span className="te-pub-match-winner__name">{winnerLabel}</span>
          </div>
        </div>
      )}

      {games && games.length > 0 && (
        <div className="te-pub-games">
          <p className="te-pub-games__title">Juegos</p>
          <div className="te-pub-games__list">
            {games.map((g, i) => (
              <span key={g.id} className="te-pub-games__chip">
                J{i + 1}: {g.pair1}-{g.pair2}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};
