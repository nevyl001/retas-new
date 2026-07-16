import React from "react";
import {
  TePubMatchOutcome,
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "./tePubShared";
import {
  PublicRetaPairSide,
  type PublicRetaPairPlayer,
} from "./PublicRetaPairSide";
import { formatMatchCourtLabel } from "../../lib/matchCourt";

export const PublicRetaMatchCard: React.FC<{
  pair1Label: string;
  pair2Label: string;
  pair1Players?: PublicRetaPairPlayer[];
  pair2Players?: PublicRetaPairPlayer[];
  score1: number;
  score2: number;
  hasResult: boolean;
  court: number | null;
  status: "finished" | "active";
  live?: boolean;
  index: number;
  winnerLabel?: string | null;
  games?: { id: string; pair1: number; pair2: number }[];
  remontadaRound?: number;
  encounterLabel?: string;
  pair1TeamLabel?: string | null;
  pair2TeamLabel?: string | null;
  pair1TeamIndex?: number | null;
  pair2TeamIndex?: number | null;
}> = ({
  pair1Label,
  pair2Label,
  pair1Players = [],
  pair2Players = [],
  score1,
  score2,
  hasResult,
  court,
  status,
  live = false,
  index,
  winnerLabel: winnerLabelProp,
  games,
  remontadaRound,
  encounterLabel,
  pair1TeamLabel = null,
  pair2TeamLabel = null,
  pair1TeamIndex = null,
  pair2TeamIndex = null,
}) => {
  const played = status === "finished" && hasResult;
  const pair1Wins = played && score1 > score2;
  const pair2Wins = played && score2 > score1;
  const isTie = played && score1 === score2;
  const winnerLabel =
    winnerLabelProp ??
    (pair1Wins ? pair1Label : pair2Wins ? pair2Label : null);

  return (
    <article
      className={`te-pub-match te-pub-match--wide te-pub-fade-in-up${
        remontadaRound != null ? " te-pub-match--remontada" : ""
      }${isTie ? " te-pub-match--tie" : ""}`}
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <div className="te-pub-match__top-left">
          {encounterLabel ? (
            <span className="te-pub-match__encounter">{encounterLabel}</span>
          ) : null}
          <TePubMatchStatus
            variant={
              status === "finished"
                ? "finished"
                : live
                  ? "live"
                  : "pending"
            }
          />
        </div>
        <span className="te-pub-cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          {formatMatchCourtLabel(court)}
        </span>
      </div>

      <div className="te-pub-match__faceoff">
        <div className="te-pub-match__slot te-pub-match__slot--pair1">
          <PublicRetaPairSide
            players={pair1Players}
            label={pair1Label}
            align="left"
            isWinner={pair1Wins}
            isTie={isTie}
            teamLabel={pair1TeamLabel}
            teamIndex={pair1TeamIndex}
          />
        </div>

        <span className="te-pub-match__vs" aria-hidden>
          VS
        </span>

        <div className="te-pub-match__slot te-pub-match__slot--pair2">
          <PublicRetaPairSide
            players={pair2Players}
            label={pair2Label}
            align="right"
            isWinner={pair2Wins}
            isTie={isTie}
            teamLabel={pair2TeamLabel}
            teamIndex={pair2TeamIndex}
          />
        </div>

        <div className="te-pub-match__score-block te-pub-match__score-block--center te-pub-match__slot te-pub-match__slot--score">
          {hasResult ? (
            <div className="te-pub-score te-pub-score--faceoff">
              <span
                className={`te-pub-score__num${tePubScoreNumModifier({
                  isWin: pair1Wins,
                  isTie,
                })}`}
              >
                {score1}
              </span>
              <span className="te-pub-score__sep">—</span>
              <span
                className={`te-pub-score__num${tePubScoreNumModifier({
                  isWin: pair2Wins,
                  isTie,
                })}`}
              >
                {score2}
              </span>
            </div>
          ) : (
            <span className="te-pub-score te-pub-score--pending te-pub-score--pending-label">
              Sin marcador
            </span>
          )}
        </div>
      </div>

      <TePubMatchOutcome winnerLabel={winnerLabel} isTie={isTie} />

      {games && games.length > 0 && (
        <div
          className={`te-pub-games${
            games.length === 1 ? " te-pub-games--solo" : ""
          }`}
        >
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
