import React from "react";
import type { AmericanoSnapshotMatch } from "../../lib/americanoDinamicoStorage";
import { formatMatchCourtLabel } from "../../lib/matchCourt";
import { AmericanoPairLine } from "../americano/AmericanoPairLine";
import {
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "./tePubShared";
import "./reta-public-scoreboard.css";

function teamPlayers(
  pair: [{ id: string; name: string }, { id: string; name: string }],
  ratings?: Record<string, number>,
  fotos?: Record<string, string | null>
): { id: string; name: string; fotoUrl: string | null }[] {
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
}: {
  players: { id: string; name: string; fotoUrl?: string | null }[];
  pairLabel: string;
  hasResult: boolean;
  isWinner: boolean;
  isTie: boolean;
}) {
  return (
    <AmericanoPairLine
      label={pairLabel}
      highlight={isTie ? "tie" : isWinner ? "win" : hasResult ? "loss" : undefined}
      players={players.map((player) => ({
        id: player.id,
        name: player.name,
        fotoUrl: player.fotoUrl,
      }))}
    />
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
      className={`te-pub-match te-pub-match--wide te-pub-match--americano am-pub-match am-pub-match--split-vs reta-sb-card reta-sb-card--split-vs te-pub-fade-in-up${
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

      <div className="am-match-lineup">
        <TeamPairBlock
          players={playersA}
          pairLabel={teamLabel(m.teamA)}
          hasResult={played}
          isWinner={aWins}
          isTie={isTie}
        />
        <div
          className="am-match-lineup__score"
          aria-label={
            played ? `Marcador ${m.scoreA} a ${m.scoreB}` : "Sin marcador"
          }
        >
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
              <span className="te-pub-score__sep" aria-hidden>
                -
              </span>
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
            <span className="te-pub-score te-pub-score--pending">—</span>
          )}
        </div>
        <TeamPairBlock
          players={playersB}
          pairLabel={teamLabel(m.teamB)}
          hasResult={played}
          isWinner={bWins}
          isTie={isTie}
        />
      </div>
    </article>
  );
};
