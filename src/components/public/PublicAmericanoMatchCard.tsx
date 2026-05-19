import React from "react";
import type { AmericanoSnapshotMatch } from "../../lib/americanoDinamicoStorage";
import {
  TePubMatchOutcome,
  tePubScoreNumModifier,
} from "./tePubShared";

function MatchStatus({ played, live }: { played: boolean; live: boolean }) {
  if (played) {
    return (
      <span className="te-pub-status te-pub-status--played">
        <span aria-hidden>✓</span> Jugado
      </span>
    );
  }
  if (live) {
    return (
      <span className="te-pub-status te-pub-status--live">
        <span className="te-pub-status__dot" aria-hidden />
        En vivo
      </span>
    );
  }
  return <span className="te-pub-status te-pub-status--pending">Pendiente</span>;
}

export const PublicAmericanoMatchCard: React.FC<{
  match: AmericanoSnapshotMatch;
  live: boolean;
  index: number;
}> = ({ match: m, live, index }) => {
  const played =
    typeof m.scoreA === "number" && typeof m.scoreB === "number";
  const aWins = played && (m.scoreA as number) > (m.scoreB as number);
  const bWins = played && (m.scoreB as number) > (m.scoreA as number);
  const isTie = played && (m.scoreA as number) === (m.scoreB as number);
  const winnerLabel = aWins
    ? `${m.teamA[0].name} / ${m.teamA[1].name}`
    : bWins
      ? `${m.teamB[0].name} / ${m.teamB[1].name}`
      : null;

  return (
    <article
      className="te-pub-match te-pub-fade-in-up"
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <MatchStatus played={played} live={live && !played} />
        <span className="te-pub-cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          Cancha {m.court}
        </span>
      </div>

      <div className="te-pub-match__score-block">
        {played ? (
          <div className="te-pub-score">
            <span
              className={`te-pub-score__num${tePubScoreNumModifier({ isWin: aWins, isTie })}`}
            >
              {m.scoreA}
            </span>
            <span className="te-pub-score__sep">—</span>
            <span
              className={`te-pub-score__num${tePubScoreNumModifier({ isWin: bWins, isTie })}`}
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

      <div className="te-pub-match__teams">
        <span className={`te-pub-match__team${aWins ? " te-pub-match__team--win" : ""}`}>
          {m.teamA[0].name} / {m.teamA[1].name}
        </span>
        <span className="te-pub-match__vs">vs</span>
        <span className={`te-pub-match__team${bWins ? " te-pub-match__team--win" : ""}`}>
          {m.teamB[0].name} / {m.teamB[1].name}
        </span>
      </div>

      <TePubMatchOutcome winnerLabel={winnerLabel} isTie={isTie} />
    </article>
  );
};
