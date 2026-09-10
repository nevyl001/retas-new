import React, { useEffect, useRef, useState } from "react";
import {
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "./tePubShared";
import type { PublicRetaPairPlayer } from "./PublicRetaPairSide";
import { PublicSplitVsPairHalf } from "./split-vs";
import { formatMatchCourtLabel } from "../../lib/matchCourt";
import { useRetryableImage } from "../../hooks/useRetryableImage";
import {
  isPhotographicSplitVsFoto,
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "../liga/jornada-public/ligaJornadaMatchNames";
import "./reta-public-scoreboard.css";

function shortTeamLabel(name: string): string {
  const cleaned = name.replace(/^team\s+/i, "").trim();
  return cleaned || name;
}

/** Retrato grande para el duelo por equipos. */
function EqDuelPortrait({ player }: { player: PublicRetaPairPlayer }) {
  const { primary, secondary } = splitPlayerDisplayName(player.name);
  const tone = playerAvatarHashTone(player.name);
  const initials = `${primary.charAt(0)}${
    secondary?.charAt(0) ?? primary.charAt(1) ?? ""
  }`.toUpperCase();
  const candidate =
    isPhotographicSplitVsFoto(player.fotoUrl) && player.fotoUrl
      ? player.fotoUrl.trim()
      : null;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const showPhoto = Boolean(candidate) && !failed && loaded;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [candidate]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !candidate) return;
    if (img.complete) {
      if (img.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, [candidate]);

  return (
    <div
      className={`reta-eq-duel__portrait${
        showPhoto ? " reta-eq-duel__portrait--photo" : " reta-eq-duel__portrait--fallback"
      }`}
      style={
        showPhoto
          ? undefined
          : ({
              ["--eq-duel-fallback-bg" as string]: tone.background,
              ["--eq-duel-fallback-fg" as string]: tone.color,
            } as React.CSSProperties)
      }
      aria-label={player.name}
    >
      {!showPhoto ? (
        <span className="reta-eq-duel__initials" aria-hidden>
          {initials}
        </span>
      ) : null}
      {candidate && !failed ? (
        <img
          ref={imgRef}
          className={`reta-eq-duel__photo${loaded ? " is-visible" : ""}`}
          src={candidate}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

/** Lado de equipo: fotos con presencia + crest del club. */
function EqDuelSide({
  teamName,
  logoUrl,
  players,
  pairLabel,
  isWinner,
  isTie,
  hasResult,
  side,
}: {
  teamName?: string | null;
  logoUrl?: string | null;
  players: PublicRetaPairPlayer[];
  pairLabel: string;
  isWinner: boolean;
  isTie: boolean;
  hasResult: boolean;
  side: "a" | "b";
}) {
  const [p1, p2] = players;
  const hasTeam = Boolean(teamName?.trim());
  const displayTeam = hasTeam ? shortTeamLabel(teamName!.trim()) : pairLabel;
  const { src: logoSrc, onError: onLogoError } = useRetryableImage(logoUrl);

  return (
    <section
      className={[
        "reta-eq-duel__side",
        `reta-eq-duel__side--${side}`,
        isWinner ? "reta-eq-duel__side--win" : "",
        isTie ? "reta-eq-duel__side--tie" : "",
        hasResult && !isWinner && !isTie ? "reta-eq-duel__side--loss" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Equipo ${displayTeam}`}
    >
      <div className="reta-eq-duel__aura" aria-hidden />

      {logoSrc ? (
        <div className="reta-eq-duel__mark" aria-hidden>
          <img
            className="reta-eq-duel__mark-img"
            src={logoSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={onLogoError}
          />
        </div>
      ) : null}

      <div className="reta-eq-duel__portraits">
        {p1 ? <EqDuelPortrait player={p1} /> : null}
        {p2 ? <EqDuelPortrait player={p2} /> : null}
        {!p1 && !p2 ? (
          <div className="reta-eq-duel__portrait reta-eq-duel__portrait--fallback">
            <span className="reta-eq-duel__initials">?</span>
          </div>
        ) : null}
      </div>

      {logoSrc ? (
        <div className="reta-eq-duel__crest" aria-hidden>
          <img
            className="reta-eq-duel__crest-img"
            src={logoSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={onLogoError}
          />
        </div>
      ) : (
        <div className="reta-eq-duel__crest reta-eq-duel__crest--text" aria-hidden>
          <span>{displayTeam.slice(0, 2).toUpperCase()}</span>
        </div>
      )}

      {isWinner && !isTie ? (
        <span className="reta-eq-duel__win-pip" aria-label="Ganador" />
      ) : null}
    </section>
  );
}

/** Pareja clásica Split VS (Reta no-equipos). */
function ClassicTeamPairBlock({
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
  const hasPlayers = Boolean(p1 || p2);
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
            {hasPlayers && p1 ? (
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
  winnerLabel: _winnerLabelProp,
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

  const statusVariant =
    scheduleStatus ??
    (status === "finished" ? "finished" : live ? "live" : "pending");

  const hasTeams = Boolean(
    pair1TeamLabel?.trim() || pair2TeamLabel?.trim()
  );

  return (
    <article
      className={`te-pub-match te-pub-match--wide reta-sb-card reta-sb-card--split-vs te-pub-fade-in-up${
        remontadaRound != null ? " te-pub-match--remontada" : ""
      }${isTie ? " te-pub-match--tie" : ""}${
        statusVariant === "live" ? " reta-sb-card--live" : ""
      }${hasTeams ? " reta-sb-card--teams reta-eq-duel-card" : ""}`}
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

      {hasTeams ? (
        <div className="reta-eq-duel">
          <EqDuelSide
            teamName={pair1TeamLabel}
            logoUrl={pair1LogoUrl}
            players={pair1Players}
            pairLabel={pair1Label}
            hasResult={hasResult}
            isWinner={pair1Wins}
            isTie={isTie}
            side="a"
          />

          <div className="reta-eq-duel__vs" aria-hidden>
            <span className="reta-eq-duel__vs-ring">vs</span>
          </div>

          <EqDuelSide
            teamName={pair2TeamLabel}
            logoUrl={pair2LogoUrl}
            players={pair2Players}
            pairLabel={pair2Label}
            hasResult={hasResult}
            isWinner={pair2Wins}
            isTie={isTie}
            side="b"
          />
        </div>
      ) : (
        <div className="reta-sb-card__board">
          <ClassicTeamPairBlock
            players={pair1Players}
            pairLabel={pair1Label}
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

          <ClassicTeamPairBlock
            players={pair2Players}
            pairLabel={pair2Label}
            hasResult={hasResult}
            isWinner={pair2Wins}
            isTie={isTie}
            side="b"
          />
        </div>
      )}

      <div
        className={`reta-sb-card__scoreboard${
          hasTeams ? " reta-eq-duel__scoreboard" : ""
        }`}
        aria-label={
          hasResult ? `Marcador ${score1} a ${score2}` : "Sin marcador"
        }
      >
        {hasResult ? (
          <div className="te-pub-score te-pub-score--faceoff reta-sb-card__score-faceoff">
            <span
              className={`te-pub-score__num${tePubScoreNumModifier({
                isWin: pair1Wins,
                isTie,
              })}`}
            >
              {score1}
            </span>
            <span className="te-pub-score__sep" aria-hidden>
              -
            </span>
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
          <span className="te-pub-score te-pub-score--pending reta-sb-card__score-pending">
            —
          </span>
        )}
      </div>

      {games && games.length > 1 ? (
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
      ) : null}
    </article>
  );
};
