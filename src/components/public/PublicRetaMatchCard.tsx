import React from "react";
import {
  TePubMatchOutcome,
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "./tePubShared";
import type { PublicRetaPairPlayer } from "./PublicRetaPairSide";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { TeamLogo } from "../reta/equipos/TeamLogo";
import { formatMatchCourtLabel } from "../../lib/matchCourt";
import "./reta-public-scoreboard.css";

function shortTeamLabel(name: string): string {
  const cleaned = name.replace(/^team\s+/i, "").trim();
  return cleaned || name;
}

function ScoreboardPlayerLine({ player }: { player: PublicRetaPairPlayer }) {
  return (
    <div className="reta-sb-player">
      <JugadorAvatar
        fotoUrl={player.fotoUrl}
        nombre={player.name}
        size="lg"
        className="reta-sb-player__av"
      />
      <span className="reta-sb-player__name">{player.name}</span>
    </div>
  );
}

/** Bloque explícito: equipo (logo+nombre) + pareja + marcador. */
function TeamPairBlock({
  teamName,
  logoUrl,
  players,
  pairLabel,
  score,
  hasResult,
  isWinner,
  isTie,
  side,
}: {
  teamName?: string | null;
  logoUrl?: string | null;
  players: PublicRetaPairPlayer[];
  pairLabel: string;
  score: number;
  hasResult: boolean;
  isWinner: boolean;
  isTie: boolean;
  side: "a" | "b";
}) {
  const [p1, p2] = players;
  const hasPlayers = Boolean(p1 || p2);
  const hasTeam = Boolean(teamName?.trim());
  const displayTeam = hasTeam ? shortTeamLabel(teamName!.trim()) : "";

  return (
    <section
      className={[
        "reta-sb-team",
        `reta-sb-team--${side}`,
        hasTeam ? "reta-sb-team--branded" : "",
        isWinner ? "reta-sb-team--win" : "",
        isTie ? "reta-sb-team--tie" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        hasTeam
          ? `Equipo ${displayTeam}`
          : `Pareja ${pairLabel}`
      }
    >
      {hasTeam ? (
        <div className="reta-sb-team__watermark" aria-hidden>
          <TeamLogo
            logoUrl={logoUrl}
            teamName={teamName!}
            size="hero"
            loading="lazy"
            className="reta-sb-team__watermark-logo"
          />
        </div>
      ) : null}

      <div className="reta-sb-team__body">
        <div className="reta-sb-team__head">
          <div className="reta-sb-team__identity">
            {hasTeam ? (
              <>
                <TeamLogo
                  logoUrl={logoUrl}
                  teamName={teamName!}
                  size="md"
                  loading="lazy"
                  className="reta-sb-team__logo"
                />
                <div className="reta-sb-team__titles">
                  <span className="reta-sb-team__kicker">Equipo</span>
                  <span className="reta-sb-team__name">{displayTeam}</span>
                </div>
              </>
            ) : (
              <span className="reta-sb-team__name reta-sb-team__name--pair">
                {pairLabel}
              </span>
            )}
          </div>
          <div
            key={`${hasResult ? "r" : "p"}-${score}`}
            className={`reta-sb-team__score${tePubScoreNumModifier({
              isWin: isWinner,
              isTie,
            })}`}
            aria-label={hasResult ? `Marcador ${score}` : "Sin marcador"}
          >
            {hasResult ? score : "—"}
          </div>
        </div>

        <div className="reta-sb-team__players">
          {hasPlayers ? (
            <>
              {p1 ? <ScoreboardPlayerLine player={p1} /> : null}
              {p2 ? <ScoreboardPlayerLine player={p2} /> : null}
            </>
          ) : (
            <div className="reta-sb-player">
              <span
                className="reta-sb-player__av reta-sb-player__av--fallback"
                aria-hidden
              >
                ?
              </span>
              <span className="reta-sb-player__name">{pairLabel}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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
  scheduleStatus?: "finished" | "live" | "upcoming" | "pending";
  index: number;
  winnerLabel?: string | null;
  games?: { id: string; pair1: number; pair2: number }[];
  remontadaRound?: number;
  encounterLabel?: string;
  pair1TeamLabel?: string | null;
  pair2TeamLabel?: string | null;
  pair1TeamIndex?: number | null;
  pair2TeamIndex?: number | null;
  pair1LogoUrl?: string | null;
  pair2LogoUrl?: string | null;
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
  scheduleStatus,
  index,
  winnerLabel: winnerLabelProp,
  games,
  remontadaRound,
  encounterLabel,
  pair1TeamLabel = null,
  pair2TeamLabel = null,
  pair1LogoUrl = null,
  pair2LogoUrl = null,
}) => {
  const played = status === "finished" && hasResult;
  const pair1Wins = played && score1 > score2;
  const pair2Wins = played && score2 > score1;
  const isTie = played && score1 === score2;
  const winnerLabel =
    winnerLabelProp ??
    (pair1Wins
      ? pair1TeamLabel?.trim() || pair1Label
      : pair2Wins
        ? pair2TeamLabel?.trim() || pair2Label
        : null);

  const statusVariant =
    scheduleStatus ??
    (status === "finished" ? "finished" : live ? "live" : "pending");

  const hasTeams = Boolean(
    pair1TeamLabel?.trim() || pair2TeamLabel?.trim()
  );

  return (
    <article
      className={`te-pub-match te-pub-match--wide reta-sb-card te-pub-fade-in-up${
        remontadaRound != null ? " te-pub-match--remontada" : ""
      }${isTie ? " te-pub-match--tie" : ""}${
        statusVariant === "live" ? " reta-sb-card--live" : ""
      }${hasTeams ? " reta-sb-card--teams" : ""}`}
      style={{ animationDelay: `${0.08 + index * 0.05}s` }}
    >
      <header className="reta-sb-card__meta">
        <p className="reta-sb-card__meta-line">
          <span>{formatMatchCourtLabel(court)}</span>
          {encounterLabel ? (
            <>
              <span className="reta-sb-card__meta-sep" aria-hidden>
                ·
              </span>
              <span>{encounterLabel}</span>
            </>
          ) : null}
        </p>
        <div className="reta-sb-card__status">
          <TePubMatchStatus variant={statusVariant} />
        </div>
      </header>

      <div className="reta-sb-card__board">
        <TeamPairBlock
          teamName={pair1TeamLabel}
          logoUrl={pair1LogoUrl}
          players={pair1Players}
          pairLabel={pair1Label}
          score={score1}
          hasResult={hasResult}
          isWinner={pair1Wins}
          isTie={isTie}
          side="a"
        />

        <div className="reta-sb-vs" aria-hidden>
          <span className="reta-sb-vs__line" />
          <span className="reta-sb-vs__badge">VS</span>
          <span className="reta-sb-vs__line" />
        </div>

        <TeamPairBlock
          teamName={pair2TeamLabel}
          logoUrl={pair2LogoUrl}
          players={pair2Players}
          pairLabel={pair2Label}
          score={score2}
          hasResult={hasResult}
          isWinner={pair2Wins}
          isTie={isTie}
          side="b"
        />
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
