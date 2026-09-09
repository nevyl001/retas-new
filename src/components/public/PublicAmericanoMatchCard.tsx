import React from "react";
import type { AmericanoSnapshotMatch } from "../../lib/americanoDinamicoStorage";
import { formatMatchCourtLabel } from "../../lib/matchCourt";
import type { PublicRetaPairPlayer } from "./PublicRetaPairSide";
import { PublicSplitVsPairHalf } from "./split-vs";
import {
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "./tePubShared";
import "./reta-public-scoreboard.css";

function teamPlayers(
  pair: [{ id: string; name: string }, { id: string; name: string }],
  ratings?: Record<string, number>,
  fotos?: Record<string, string | null>
): PublicRetaPairPlayer[] {
  return pair.map((p) => ({
    id: p.id,
    name: p.name,
    rating: ratings?.[p.id] ?? null,
    fotoUrl: fotos?.[p.id] ?? null,
  }));
}

function teamLabel(
  pair: [{ id: string; name: string }, { id: string; name: string }]
): string {
  return `${pair[0].name} / ${pair[1].name}`;
}

function TeamPairBlock({
  players,
  pairLabel,
  hasResult,
  isWinner,
  isTie,
  side,
}: {
  players: PublicRetaPairPlayer[];
  pairLabel: string;
  hasResult: boolean;
  isWinner: boolean;
  isTie: boolean;
  side: "a" | "b";
}) {
  const [p1, p2] = players;
  const tone = isTie
    ? "neutral"
    : isWinner
      ? "win"
      : hasResult
        ? "loss"
        : "neutral";

  return (
    <section
      className={[
        "reta-sb-team",
        `reta-sb-team--${side}`,
        "reta-sb-team--split-vs",
        isWinner ? "reta-sb-team--win" : "",
        isTie ? "reta-sb-team--tie" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Pareja ${pairLabel}`}
    >
      <div className="reta-sb-team__body">
        <div className="reta-sb-team__main">
          <div className="reta-sb-team__players reta-sb-team__players--split-vs">
            {p1 ? (
              <PublicSplitVsPairHalf
                player1={{ name: p1.name, foto: p1.fotoUrl }}
                player2={p2 ? { name: p2.name, foto: p2.fotoUrl } : null}
                label={pairLabel}
                tone={tone}
                showWinnerBadge={isWinner && !isTie}
                className="pub-split-vs-pair--compact"
              />
            ) : (
              <PublicSplitVsPairHalf
                player1={{ name: pairLabel, foto: null }}
                tone={tone}
                className="pub-split-vs-pair--compact"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export const PublicAmericanoMatchCard: React.FC<{
  match: AmericanoSnapshotMatch;
  live: boolean;
  scheduleStatus?: "finished" | "live" | "upcoming" | "pending" | "played";
  /** @deprecated Siempre se muestra el badge (paridad con Reta Split VS). */
  showStatusBadge?: boolean;
  index: number;
  playerRatings?: Record<string, number>;
  playerFotos?: Record<string, string | null>;
}> = ({
  match: m,
  live,
  scheduleStatus,
  index,
  playerRatings,
  playerFotos,
}) => {
  const played =
    typeof m.scoreA === "number" && typeof m.scoreB === "number";
  const aWins = played && (m.scoreA as number) > (m.scoreB as number);
  const bWins = played && (m.scoreB as number) > (m.scoreA as number);
  const isTie = played && (m.scoreA as number) === (m.scoreB as number);
  const matchState =
    scheduleStatus ?? (played ? "played" : live ? "live" : "pending");

  const playersA = teamPlayers(m.teamA, playerRatings, playerFotos);
  const playersB = teamPlayers(m.teamB, playerRatings, playerFotos);

  return (
    <article
      className={`te-pub-match te-pub-match--wide te-pub-match--americano am-pub-match reta-sb-card reta-sb-card--split-vs te-pub-fade-in-up${
        isTie ? " te-pub-match--tie" : ""
      }${matchState === "live" ? " reta-sb-card--live" : ""}`}
      data-match-state={matchState}
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <header className="reta-sb-card__meta">
        <p className="reta-sb-card__meta-line">
          <span>{formatMatchCourtLabel(m.court)}</span>
        </p>
        <div className="reta-sb-card__status">
          <TePubMatchStatus variant={matchState} />
        </div>
      </header>

      <div className="reta-sb-card__board">
        <TeamPairBlock
          players={playersA}
          pairLabel={teamLabel(m.teamA)}
          hasResult={played}
          isWinner={aWins}
          isTie={isTie}
          side="a"
        />

        <div className="reta-sb-vs" aria-hidden>
          <span className="reta-sb-vs__line" />
          <span className="reta-sb-vs__badge">VS</span>
          <span className="reta-sb-vs__line" />
        </div>

        <TeamPairBlock
          players={playersB}
          pairLabel={teamLabel(m.teamB)}
          hasResult={played}
          isWinner={bWins}
          isTie={isTie}
          side="b"
        />
      </div>

      <div
        className="reta-sb-card__scoreboard"
        aria-label={
          played ? `Marcador ${m.scoreA} a ${m.scoreB}` : "Sin marcador"
        }
      >
        {played ? (
          <div className="te-pub-score te-pub-score--faceoff reta-sb-card__score-faceoff">
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
          <span className="te-pub-score te-pub-score--pending reta-sb-card__score-pending">
            —
          </span>
        )}
      </div>
    </article>
  );
};
