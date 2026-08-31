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

export const PublicAmericanoMatchCard: React.FC<{
  match: AmericanoSnapshotMatch;
  live: boolean;
  scheduleStatus?: "finished" | "live" | "upcoming" | "pending" | "played";
  /** false cuando el estado ya aparece en hero/ronda (evita repetir "Por comenzar"). */
  showStatusBadge?: boolean;
  index: number;
  playerRatings?: Record<string, number>;
  playerFotos?: Record<string, string | null>;
}> = ({
  match: m,
  live,
  scheduleStatus,
  showStatusBadge = true,
  index,
  playerRatings,
  playerFotos,
}) => {
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
  const matchState =
    scheduleStatus ?? (played ? "played" : live ? "live" : "pending");

  return (
    <article
      className={`te-pub-match te-pub-match--wide te-pub-match--americano am-pub-match te-pub-fade-in-up${
        isTie ? " te-pub-match--tie" : ""
      }`}
      data-match-state={matchState}
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div
        className={`te-pub-match__top${
          showStatusBadge ? "" : " am-pub-match__top--cancha-only"
        }`}
      >
        {showStatusBadge ? (
          <div className="te-pub-match__top-left">
            <TePubMatchStatus variant={matchState} />
          </div>
        ) : null}
        <span className="te-pub-cancha am-pub-match__cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          Cancha {m.court}
        </span>
      </div>

      <div className="te-pub-match__faceoff">
        <div className="te-pub-match__slot te-pub-match__slot--pair1">
          <PublicRetaPairSide
            players={teamPlayers(m.teamA, playerRatings, playerFotos)}
            label={teamLabel(m.teamA)}
            align="left"
            variant="band"
            joinVariant="team"
            isWinner={aWins}
            isTie={isTie}
          />
        </div>

        <div className="te-pub-match__vs" role="separator" aria-label="versus">
          <span className="te-pub-match__vs-line" aria-hidden />
          <span className="te-pub-match__vs-text">VS</span>
          <span className="te-pub-match__vs-line" aria-hidden />
        </div>

        <div className="te-pub-match__slot te-pub-match__slot--pair2">
          <PublicRetaPairSide
            players={teamPlayers(m.teamB, playerRatings, playerFotos)}
            label={teamLabel(m.teamB)}
            align="right"
            variant="band"
            joinVariant="team"
            isWinner={bWins}
            isTie={isTie}
          />
        </div>

        <div className="te-pub-match__score-block te-pub-match__score-block--center te-pub-match__slot te-pub-match__slot--score">
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
            <div className="am-pub-match__score-pending">
              <span className="te-pub-score te-pub-score--pending te-pub-score--pending-label am-pub-match__pending-label">
                Marcador pendiente
              </span>
              <span className="am-pub-match__details-hint">Ver detalles</span>
            </div>
          )}
        </div>
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
