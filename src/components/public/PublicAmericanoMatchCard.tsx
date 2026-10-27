import React from "react";
import type { AmericanoSnapshotMatch } from "../../lib/americanoDinamicoStorage";
import { formatMatchCourtLabel } from "../../lib/matchCourt";
import { AmericanoCourtBoard, AmericanoPairMark } from "../americano/AmericanoCourtBoard";
import { TePubMatchStatus } from "./tePubShared";
import "./reta-public-scoreboard.css";

function teamPlayers(
  pair: [{ id: string; name: string }, { id: string; name: string }],
  fotos?: Record<string, string | null>,
  ratings?: Record<string, number>
) {
  return pair.map((p) => ({
    id: p.id,
    name: p.name,
    fotoUrl: fotos?.[p.id] ?? null,
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
  const isTie = played && (m.scoreA as number) === (m.scoreB as number);
  const matchState =
    scheduleStatus ?? (played ? "played" : live ? "live" : "pending");

  const playersA = teamPlayers(m.teamA, playerFotos, playerRatings);
  const playersB = teamPlayers(m.teamB, playerFotos, playerRatings);

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

      <AmericanoCourtBoard
        sideA={playersA}
        sideB={playersB}
        labelA={teamLabel(m.teamA)}
        labelB={teamLabel(m.teamB)}
        scoreA={
          <AmericanoPairMark
            value={played ? m.scoreA : null}
            opponent={played ? m.scoreB : null}
          />
        }
        scoreB={
          <AmericanoPairMark
            value={played ? m.scoreB : null}
            opponent={played ? m.scoreA : null}
          />
        }
      />
    </article>
  );
};
