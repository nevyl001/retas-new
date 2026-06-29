import React from "react";
import type { AmericanoSnapshotMatch } from "../../lib/americanoDinamicoStorage";
import {
  PublicRetaPairSide,
  type PublicRetaPairPlayer,
} from "./PublicRetaPairSide";
import {
  TePubMatchOutcome,
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "./tePubShared";

function teamPlayers(
  pair: [{ id: string; name: string }, { id: string; name: string }],
  ratings?: Record<string, number>
): PublicRetaPairPlayer[] {
  return pair.map((p) => ({
    id: p.id,
    name: p.name,
    rating: ratings?.[p.id] ?? null,
  }));
}

function teamLabel(
  pair: [{ id: string; name: string }, { id: string; name: string }]
): string {
  return `${pair[0].name} / ${pair[1].name}`;
}

export const PublicAmericanoMatchCard: React.FC<{
  match: AmericanoSnapshotMatch;
  live: boolean;
  index: number;
  playerRatings?: Record<string, number>;
}> = ({ match: m, live, index, playerRatings }) => {
  const played =
    typeof m.scoreA === "number" && typeof m.scoreB === "number";
  const aWins = played && (m.scoreA as number) > (m.scoreB as number);
  const bWins = played && (m.scoreB as number) > (m.scoreA as number);
  const isTie = played && (m.scoreA as number) === (m.scoreB as number);
  const winnerLabel = aWins
    ? teamLabel(m.teamA)
    : bWins
      ? teamLabel(m.teamB)
      : null;

  return (
    <article
      className="te-pub-match te-pub-match--wide te-pub-match--americano te-pub-fade-in-up"
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <div className="te-pub-match__top-left">
          <TePubMatchStatus
            variant={played ? "played" : live ? "live" : "pending"}
          />
        </div>
        <span className="te-pub-cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          Cancha {m.court}
        </span>
      </div>

      <div className="te-pub-match__faceoff">
        <PublicRetaPairSide
          players={teamPlayers(m.teamA, playerRatings)}
          label={teamLabel(m.teamA)}
          align="left"
          isWinner={aWins}
        />

        <div className="te-pub-match__score-block te-pub-match__score-block--center">
          {played ? (
            <div className="te-pub-score te-pub-score--faceoff">
              <span
                className={`te-pub-score__num${tePubScoreNumModifier({
                  isWin: aWins,
                  isTie,
                })}`}
              >
                {m.scoreA}
              </span>
              <span className="te-pub-score__sep">—</span>
              <span
                className={`te-pub-score__num${tePubScoreNumModifier({
                  isWin: bWins,
                  isTie,
                })}`}
              >
                {m.scoreB}
              </span>
            </div>
          ) : (
            <span className="te-pub-score te-pub-score--pending te-pub-score--pending-label">
              Marcador pendiente
            </span>
          )}
        </div>

        <PublicRetaPairSide
          players={teamPlayers(m.teamB, playerRatings)}
          label={teamLabel(m.teamB)}
          align="right"
          isWinner={bWins}
        />
      </div>

      <TePubMatchOutcome winnerLabel={winnerLabel} isTie={isTie} />

      {played && (
        <div className="te-pub-games te-pub-games--solo">
          <p className="te-pub-games__title">Resultado</p>
          <div className="te-pub-games__list">
            <span className="te-pub-games__chip">
              {m.scoreA}-{m.scoreB}
            </span>
          </div>
        </div>
      )}
    </article>
  );
};
