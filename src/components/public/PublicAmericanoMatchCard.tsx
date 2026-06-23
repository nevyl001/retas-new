import React from "react";
import type { AmericanoSnapshotMatch } from "../../lib/americanoDinamicoStorage";
import { JugadorRatingChip } from "../jugadores/JugadorRatingChip";
import {
  TePubMatchOutcome,
  tePubScoreNumModifier,
} from "./tePubShared";

function formatTeamLabel(
  players: [{ id: string; name: string }, { id: string; name: string }],
  ratings?: Record<string, number>
) {
  const renderPlayer = (p: { id: string; name: string }) => (
    <span key={p.name} className="te-pub-match__team-player">
      {p.name}
      <JugadorRatingChip
        rating={ratings?.[p.id]}
        className="te-pub-match__team-rating"
      />
    </span>
  );

  return (
    <>
      {renderPlayer(players[0])}
      <span className="te-pub-match__team-sep"> / </span>
      {renderPlayer(players[1])}
    </>
  );
}

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
  playerRatings?: Record<string, number>;
}> = ({ match: m, live, index, playerRatings }) => {
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
          {formatTeamLabel(m.teamA, playerRatings)}
        </span>
        <span className="te-pub-match__vs">vs</span>
        <span className={`te-pub-match__team${bWins ? " te-pub-match__team--win" : ""}`}>
          {formatTeamLabel(m.teamB, playerRatings)}
        </span>
      </div>

      <TePubMatchOutcome winnerLabel={winnerLabel} isTie={isTie} />
    </article>
  );
};
