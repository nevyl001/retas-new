import React, { useMemo, useState } from "react";
import type { PublicMatchupCard } from "../../../lib/torneoExpress/publicBracketModel";
import {
  buildBracketPresentationModel,
  formatMatchScoreForDisplay,
  type BracketMatchPresentation,
  type BracketRoundPresentation,
  type BracketTeamPresentation,
  type MatchScoreDisplayColumn,
} from "../../../lib/torneoExpress/publicBracketPresentation";
import {
  formatPublicPodiumDif,
  type PublicEliminatoriaPodiumStats,
} from "../../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import {
  createPodiumSharePresentation,
  type PodiumSharePlace,
} from "../../../lib/torneoExpress/publicPodiumSharePresentation";
import { shareTournamentPodiumImage } from "../../../lib/torneoExpress/shareTournamentPodiumImage";
import { RIVIERA_CO_BRAND_ATTRIBUTION } from "../../../club-experience/motherBrand";
import {
  RIVIERA_SOCIAL_HANDLE,
  RIVIERA_SOCIAL_LINKS,
} from "../../../lib/rivieraBranding";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import type { PublicRetaPairPlayer } from "../../public/PublicRetaPairSide";
import { TablerIcon } from "../../ui/TablerIcon";
import { TournamentPodiumShareCard } from "./TournamentPodiumShareCard";
import "../../jugadores/riviera-jugadores.css";

const SOCIAL_ICON_BY_ID = {
  instagram: "brand-instagram",
  tiktok: "brand-tiktok",
  facebook: "brand-facebook",
} as const;

function getTeamPlayers(team: BracketTeamPresentation) {
  return team.players.length > 0
    ? team.players
    : team.names.map((name, index) => ({
        id: `${team.parejaId ?? team.label}-${index + 1}`,
        name,
        fotoUrl: null,
        rating: null,
      }));
}

function PlayerRow({
  player,
  parejaId,
  imageLoading,
}: {
  player: BracketTeamPresentation["players"][number];
  parejaId: string | null;
  imageLoading: "eager" | "lazy";
}) {
  return (
    <span
      className="te-pb-team__name"
      aria-label={`Jugador ${player.name}`}
      data-player-id={player.id}
      data-pair-id={parejaId ?? undefined}
      data-photo-state={player.fotoUrl ? "provided" : "missing"}
    >
      <span className="te-pb-player__portrait">
        <JugadorAvatar
          fotoUrl={player.fotoUrl}
          nombre={player.name}
          size="sm"
          loading={imageLoading}
          alt={player.fotoUrl ? `Foto de ${player.name}` : ""}
          className="te-pb-team__avatar te-pb-team__avatar--inline"
        />
      </span>
      <span className="te-pb-player__identity">
        <span className="te-pb-team__player-name">{player.name}</span>
        {player.rating != null ? (
          <span className="te-pb-team__rating">
            <span className="te-pb-team__rating-label">Rating</span>
            {player.rating.toFixed(2)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function TeamBlock({
  team,
  imageLoading,
  showResultState = false,
  scoreColumns,
  scoreSide,
}: {
  team: BracketTeamPresentation;
  imageLoading: "eager" | "lazy";
  showResultState?: boolean;
  scoreColumns?: MatchScoreDisplayColumn[];
  scoreSide?: "local" | "visit";
}) {
  if (team.kind === "bye") {
    return (
      <div className="te-pb-team te-pb-team--bye">
        <span className="te-pb-team__dep">BYE</span>
      </div>
    );
  }

  if (team.kind === "dependency") {
    return (
      <div className="te-pb-team te-pb-team--pending">
        <span className="te-pb-team__dep">{team.dependencyLabel}</span>
      </div>
    );
  }

  const playerRows = getTeamPlayers(team);

  const roleClass = team.isWinner
    ? " te-pb-team--winner"
    : team.isLoser
      ? " te-pb-team--loser"
      : "";

  return (
    <div
      className={`te-pb-team${roleClass}`}
      aria-label={team.isWinner ? `Ganador: ${team.label}` : undefined}
    >
      <div className="te-pb-team__body">
        <div className="te-pb-team__meta">
          {team.seed != null ? (
            <span className="te-pb-team__seed">#{team.seed}</span>
          ) : null}
          {team.originLabel ? (
            <span className="te-pb-team__origin">{team.originLabel}</span>
          ) : null}
          {showResultState && team.isWinner ? (
            <span className="te-pb-team__result-state">✓ GANADORES</span>
          ) : null}
        </div>
        <div className="te-pb-team__names">
          {playerRows.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              parejaId={team.parejaId}
              imageLoading={imageLoading}
            />
          ))}
        </div>
      </div>

      {scoreColumns && scoreColumns.length > 0 && scoreSide ? (
        <div
          className="te-pb-team__score-rail"
          role="group"
          aria-label={`Marcador de ${team.label}: ${scoreColumns
            .map((column) => column[scoreSide])
            .join(", ")}`}
        >
          <span className="te-pb-team__score-label">Marcador</span>
          <div className="te-pb-team__scores">
            {scoreColumns.map((column) => (
              <span key={column.key} className="te-pb-team__score">
                {column[scoreSide]}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FinalistPairHero({
  team,
  side,
  completed,
  stats,
  place = "final",
}: {
  team: BracketTeamPresentation;
  side: "local" | "visit";
  completed: boolean;
  stats: PublicEliminatoriaPodiumStats | null;
  place?: "final" | "third";
}) {
  if (team.kind !== "team") {
    return (
      <div className={`te-pb-finalist te-pb-finalist--${side}`}>
        <span className="te-pb-finalist__pending">{team.dependencyLabel}</span>
      </div>
    );
  }

  const players = getTeamPlayers(team);
  const pairLetter = side === "local" ? "A" : "B";
  const isThird = place === "third";
  const roleLabel = (() => {
    if (isThird) {
      if (completed && team.isWinner) return `Ganadores · Pareja ${pairLetter}`;
      if (completed && team.isLoser) return `Pareja ${pairLetter}`;
      return `Pareja ${pairLetter}`;
    }
    if (completed && team.isWinner) return `Campeones · Pareja ${pairLetter}`;
    if (completed && team.isLoser) return `Subcampeones · Pareja ${pairLetter}`;
    return side === "local" ? "Finalistas A" : "Finalistas B";
  })();
  const journeyLabel = isThird ? "Camino al podio" : "Camino a la final";

  return (
    <section
      className={`te-pb-finalist te-pb-finalist--${side}`}
      aria-label={
        isThird
          ? `Pareja del 3.er lugar: ${team.label}`
          : `Pareja finalista: ${team.label}`
      }
    >
      <p className="te-pb-finalist__label">{roleLabel}</p>
      <div className="te-pb-finalist__players">
        {players.map((player) => (
          <div className="te-pb-finalist__player" key={player.id}>
            <JugadorAvatar
              fotoUrl={player.fotoUrl}
              nombre={player.name}
              size="xl"
              loading="eager"
              alt={player.fotoUrl ? `Foto de ${player.name}` : ""}
              className="te-pb-finalist__avatar"
            />
            <div className="te-pb-finalist__identity">
              <strong>{player.name}</strong>
              {player.rating != null ? (
                <span>Rating {player.rating.toFixed(2)}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="te-pb-finalist__journey" aria-label={journeyLabel}>
        <span className="te-pb-finalist__journey-title">{journeyLabel}</span>
        {stats ? (
          <dl className="te-pb-finalist__journey-stats">
            <div>
              <dt title="Partidos jugados">PJ</dt>
              <dd>{stats.partidos}</dd>
            </div>
            <div>
              <dt title="Partidos ganados">PG</dt>
              <dd>{stats.victorias}</dd>
            </div>
            <div>
              <dt title="Puntos a favor">PF</dt>
              <dd>{stats.juegosFavor}</dd>
            </div>
            <div>
              <dt title="Puntos en contra">PC</dt>
              <dd>{stats.juegosContra}</dd>
            </div>
          </dl>
        ) : null}
        {team.seed != null || team.originLabel ? (
          <div className="te-pb-finalist__journey-meta">
            {team.seed != null ? <span>Seed #{team.seed}</span> : null}
            {team.originLabel ? <span>{team.originLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FinalHeroScoreboard({
  match,
  pairStatsById,
  place = "final",
}: {
  match: BracketMatchPresentation;
  pairStatsById: Record<string, PublicEliminatoriaPodiumStats | null>;
  place?: "final" | "third";
}) {
  const ariaTeams = [match.local.label, match.visit.label].join(" contra ");
  const scoreColumns = formatMatchScoreForDisplay(match.sets);
  const hasScore = scoreColumns.length > 0;
  const isThird = place === "third";
  const statsFor = (team: BracketTeamPresentation) =>
    team.parejaId ? (pairStatsById[team.parejaId] ?? null) : null;

  return (
    <article
      className={`te-pb-final-hero te-pb-match--${match.status}${
        isThird ? " te-pb-final-hero--third" : ""
      }`}
      data-match-id={match.id}
      data-ronda={match.ronda}
      data-cruce={match.cruceIndex}
      data-variant={isThird ? "third" : "final"}
      aria-label={`${match.shortTitle}: ${ariaTeams}. ${match.metaLine}`}
    >
      <span className="te-pb-final-hero__light" aria-hidden />
      <FinalistPairHero
        team={match.local}
        side="local"
        completed={match.status === "finished"}
        stats={statsFor(match.local)}
        place={place}
      />

      <section
        className="te-pb-final-core"
        aria-label={
          isThird ? "Marcador del 3.er lugar" : "Marcador de la Gran Final"
        }
      >
        <p className="te-pb-final-core__stage">
          {isThird ? "3.er Lugar" : "Gran Final"}
        </p>
        <div
          className={`te-pb-final-core__status te-pb-final-core__status--${match.status}`}
        >
          {match.statusLabel}
        </div>
        <div className="te-pb-final-core__logistics">
          <strong>{match.timeLabel}</strong>
          <span aria-hidden>·</span>
          <strong
            className={
              match.courtConfirmed
                ? "te-pb-final-core__court--confirmed"
                : "te-pb-final-core__court--pending"
            }
          >
            {match.courtLabel}
          </strong>
        </div>
        <div
          className="te-pb-final-core__score"
          aria-label="Resultado por sets"
          style={
            {
              "--te-final-score-columns": Math.max(scoreColumns.length, 1),
            } as React.CSSProperties
          }
        >
          {hasScore ? (
            <>
              <span className="te-pb-final-core__score-corner">Resultado</span>
              {scoreColumns.map((column) => (
                <span
                  className="te-pb-final-core__score-heading"
                  key={`${column.key}-heading`}
                >
                  {column.label}
                </span>
              ))}
              <span className="te-pb-final-core__score-team">A</span>
              {scoreColumns.map((column) => (
                <strong
                  key={`${column.key}-local`}
                  className={
                    match.local.isWinner
                      ? "te-pb-final-core__score-winner"
                      : undefined
                  }
                  aria-label={`${match.local.label}, ${column.label}: ${column.local}`}
                >
                  {column.local}
                </strong>
              ))}
              <span className="te-pb-final-core__score-team">B</span>
              {scoreColumns.map((column) => (
                <strong
                  key={`${column.key}-visit`}
                  className={
                    match.visit.isWinner
                      ? "te-pb-final-core__score-winner"
                      : undefined
                  }
                  aria-label={`${match.visit.label}, ${column.label}: ${column.visit}`}
                >
                  {column.visit}
                </strong>
              ))}
            </>
          ) : (
            <span className="te-pb-final-core__versus">VS</span>
          )}
        </div>
        <p className="te-pb-final-core__caption">
          {isThird
            ? "El partido que define el tercer lugar"
            : "El partido que define a los campeones"}
        </p>
      </section>

      <FinalistPairHero
        team={match.visit}
        side="visit"
        completed={match.status === "finished"}
        stats={statsFor(match.visit)}
        place={place}
      />
    </article>
  );
}

function MatchScoreboard({
  match,
  variant = "standard",
  hideLiveStatus = false,
}: {
  match: BracketMatchPresentation;
  variant?: "history" | "standard" | "semifinal" | "final" | "third";
  hideLiveStatus?: boolean;
}) {
  const scoreColumns = formatMatchScoreForDisplay(match.sets);
  const ariaTeams = [
    match.local.kind === "dependency"
      ? match.local.dependencyLabel
      : match.local.label || match.local.names.join(" / "),
    match.visit.kind === "dependency"
      ? match.visit.dependencyLabel
      : match.visit.label || match.visit.names.join(" / "),
  ].join(" contra ");

  return (
    <article
      className={`te-pb-match te-pb-match--${match.status}${
        match.isFinal ? " te-pb-match--final" : ""
      }${match.isThirdPlace ? " te-pb-match--third" : ""}${
        match.isPlaceholder ? " te-pb-match--placeholder" : ""
      } te-pb-match--${variant}`}
      data-match-id={match.id}
      data-ronda={match.ronda}
      data-cruce={match.cruceIndex}
      data-variant={variant}
      aria-label={`${match.shortTitle}: ${ariaTeams}. ${match.metaLine}`}
    >
      <header className="te-pb-match__head">
        <div className="te-pb-match__identity">
          <span className="te-pb-match__title">{match.shortTitle}</span>
          {match.status === "finished" ||
          (match.status === "live" && !hideLiveStatus) ? (
            <span
              className={`te-pb-match__status te-pb-match__status--${match.status}`}
            >
              {match.statusLabel}
            </span>
          ) : null}
        </div>

        <div
          className={`te-pb-match__logistics${
            match.courtConfirmed
              ? " te-pb-match__logistics--court-confirmed"
              : " te-pb-match__logistics--court-pending"
          }${
            match.timeConfirmed
              ? " te-pb-match__logistics--time-confirmed"
              : " te-pb-match__logistics--time-pending"
          }`}
        >
          <span className="te-pb-match__time">{match.timeLabel}</span>
          <span className="te-pb-match__logistics-sep" aria-hidden="true">
            ·
          </span>
          <span
            className={`te-pb-match__court${
              match.courtConfirmed
                ? " te-pb-match__court--confirmed"
                : " te-pb-match__court--pending"
            }`}
          >
            {match.courtLabel}
          </span>
        </div>
      </header>

      <div className="te-pb-match__body">
        <TeamBlock
          team={match.local}
          imageLoading={variant === "history" ? "lazy" : "eager"}
          showResultState={match.status === "finished"}
          scoreColumns={scoreColumns}
          scoreSide="local"
        />
        <div
          className="te-pb-match__faceoff"
          role="separator"
          aria-label="contra"
        >
          <span className="te-pb-match__faceoff-rule" aria-hidden="true" />
          <span className="te-pb-match__faceoff-mark" aria-hidden="true">
            VS
          </span>
          <span className="te-pb-match__faceoff-rule" aria-hidden="true" />
        </div>
        <TeamBlock
          team={match.visit}
          imageLoading={variant === "history" ? "lazy" : "eager"}
          showResultState={match.status === "finished"}
          scoreColumns={scoreColumns}
          scoreSide="visit"
        />
      </div>
    </article>
  );
}

function ClosingClubSignature({
  clubName,
  clubLogoUrl,
  showMotherAttribution,
}: {
  clubName: string;
  clubLogoUrl?: string | null;
  showMotherAttribution: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(clubLogoUrl?.trim()) && !logoFailed;

  return (
    <section
      className="te-pb-closing-card__signature"
      aria-label={`Organizado por ${clubName}`}
    >
      <div className="te-pb-closing-card__club">
        {showLogo ? (
          <span className="te-pb-closing-card__club-logo">
            <img
              src={clubLogoUrl!}
              alt=""
              onError={() => setLogoFailed(true)}
            />
          </span>
        ) : null}
        <div className="te-pb-closing-card__club-copy">
          <span className="te-pb-closing-card__club-name">{clubName}</span>
          {showMotherAttribution ? (
            <span className="te-pb-closing-card__club-by">
              {RIVIERA_CO_BRAND_ATTRIBUTION}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ClosingSocialSignature() {
  return (
    <div className="te-pb-closing-card__social">
      <ul aria-label="Redes sociales Riviera Open">
        {RIVIERA_SOCIAL_LINKS.map((link) => (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.label} ${RIVIERA_SOCIAL_HANDLE}`}
            >
              <TablerIcon name={SOCIAL_ICON_BY_ID[link.id]} size={16} />
            </a>
          </li>
        ))}
      </ul>
      <span>{RIVIERA_SOCIAL_HANDLE}</span>
    </div>
  );
}

function ClosingStatsStrip({
  stats,
}: {
  stats: PublicEliminatoriaPodiumStats | null;
}) {
  if (!stats) return null;

  const items = [
    { label: "PJ", value: stats.partidos, description: "Partidos jugados" },
    { label: "PG", value: stats.victorias, description: "Partidos ganados" },
    { label: "PP", value: stats.derrotas, description: "Partidos perdidos" },
    {
      label: "DIF",
      value: formatPublicPodiumDif(stats.dif),
      description: "Diferencia de juegos",
    },
  ];

  return (
    <dl
      className="te-pb-closing-card__stats"
      aria-label="Estadísticas de la pareja en este torneo"
    >
      {items.map((item) => (
        <div className="te-pb-closing-card__stat" key={item.label}>
          <dt title={item.description}>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Legacy closing markup retained temporarily while share previews roll out.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TournamentClosingCardBase({
  team,
  variant,
  tournamentName,
  category,
  clubName,
  clubLogoUrl,
  showMotherAttribution,
  stats,
}: {
  team: BracketTeamPresentation;
  variant: "champion" | "runner-up" | "third";
  tournamentName: string;
  category?: string | null;
  clubName: string;
  clubLogoUrl?: string | null;
  showMotherAttribution: boolean;
  stats: PublicEliminatoriaPodiumStats | null;
}) {
  if (team.kind !== "team") return null;

  const players = getTeamPlayers(team);
  const isChampion = variant === "champion";
  const title =
    variant === "champion"
      ? "CAMPEONES"
      : variant === "runner-up"
        ? "SUBCAMPEONES"
        : "3.er LUGAR";
  const rank =
    variant === "champion"
      ? "1.er lugar"
      : variant === "runner-up"
        ? "2.º lugar"
        : "3.er lugar";
  const tone =
    variant === "champion"
      ? "gold"
      : variant === "runner-up"
        ? "silver"
        : "bronze";
  const ariaLabel =
    variant === "champion"
      ? "Tarjeta de campeones"
      : variant === "runner-up"
        ? "Tarjeta de subcampeones"
        : "Tarjeta de tercer lugar";
  const headline =
    variant === "champion"
      ? "Felicidades, campeones."
      : variant === "runner-up"
        ? "Gran torneo."
        : "Felicidades.";
  const primary =
    variant === "champion"
      ? "Llegaron hasta el final y dejaron su nombre en lo más alto del torneo."
      : variant === "runner-up"
        ? "Llegar a la Final ya habla del nivel que mostraron durante toda la competencia."
        : "Subirse al podio es resultado de todo lo construido durante el torneo.";
  const tagline =
    variant === "champion"
      ? "Disfruten este triunfo. La próxima competencia será una nueva oportunidad para defender lo conseguido."
      : variant === "runner-up"
        ? "Quedaron a un paso, pero el camino sigue. Queremos verlos de vuelta buscando ese título."
        : "Sigan compitiendo. Cada torneo abre una nueva oportunidad para llegar todavía más lejos.";

  return (
    <aside
      className={`te-pb-closing-card te-pb-closing-card--${variant}`}
      aria-label={ariaLabel}
      data-closing-layout="tournament-recognition"
      data-podium-tone={tone}
    >
      <div className="te-pb-closing-card__art">
        <span className="te-pb-closing-card__court" aria-hidden />
        <ClosingClubSignature
          clubName={clubName}
          clubLogoUrl={clubLogoUrl}
          showMotherAttribution={showMotherAttribution}
        />
        <div className="te-pb-closing-card__topline">
          <div>
            <span>{tournamentName}</span>
            {category ? <small>{category}</small> : null}
          </div>
          <span>{rank}</span>
        </div>
        <div className="te-pb-closing-card__main">
          <p className="te-pb-closing-card__badge">{title}</p>
          <div className="te-pb-closing-card__avatars" aria-label={title}>
            {players.map((player) => (
              <div className="te-pb-closing-card__player" key={player.id}>
                <JugadorAvatar
                  fotoUrl={player.fotoUrl}
                  nombre={player.name}
                  size={isChampion ? "xl" : "md"}
                  loading={isChampion ? "eager" : "lazy"}
                  alt={player.fotoUrl ? `Foto de ${player.name}` : ""}
                  className="te-pb-closing-card__avatar"
                />
                <span title={player.name}>{player.name}</span>
              </div>
            ))}
          </div>
          <h3>{headline}</h3>
          <p>{primary}</p>
        </div>
        <ClosingStatsStrip stats={stats} />
        <p className="te-pb-closing-card__tagline">{tagline}</p>
        <ClosingSocialSignature />
      </div>
    </aside>
  );
}

function championMatchLines(
  rounds: BracketRoundPresentation[],
  parejaId: string | null,
) {
  if (!parejaId) return [];
  const lines: Array<{
    id: string;
    round: string;
    opponent: string;
    score: string;
    dif: number;
  }> = [];

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.isPlaceholder || match.status === "bye" || match.status === "pending") {
        continue;
      }
      const isLocal = match.local.parejaId === parejaId;
      const isVisit = match.visit.parejaId === parejaId;
      if (!isLocal && !isVisit) continue;
      const opponent = isLocal ? match.visit : match.local;
      if (opponent.kind !== "team") continue;
      const sets = match.sets ?? [];
      const score = sets
        .map((set) =>
          isLocal
            ? `${set.local}-${set.visitante}`
            : `${set.visitante}-${set.local}`,
        )
        .join("  ");
      let favor = 0;
      let contra = 0;
      for (const set of sets) {
        favor += isLocal ? set.local : set.visitante;
        contra += isLocal ? set.visitante : set.local;
      }
      const opponentLabel =
        opponent.names.filter(Boolean).join(" / ") || opponent.label;
      lines.push({
        id: match.id,
        round: round.tabLabel || round.title,
        opponent: opponentLabel,
        score: score || "—",
        dif: favor - contra,
      });
    }
  }

  return lines;
}

function TournamentRecap({
  team,
  place,
  tournamentName,
  category,
  stats,
  rounds,
}: {
  team: BracketTeamPresentation;
  place: "first" | "second";
  tournamentName: string;
  category?: string | null;
  stats: PublicEliminatoriaPodiumStats | null;
  rounds: BracketRoundPresentation[];
}) {
  const isChampion = place === "first";
  const players = getTeamPlayers(team).slice(0, 2);
  const matches = championMatchLines(rounds, team.parejaId);
  const eyebrow = [isChampion ? "Campeones" : "Subcampeones", tournamentName, category]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className={`te-elim-recap${isChampion ? " te-elim-recap--champion" : " te-elim-recap--second"}`}
      aria-label={isChampion ? "Resumen de los campeones" : "Resumen de los subcampeones"}
    >
      <header className="te-elim-recap__header">
        <p className="te-elim-recap__eyebrow">{eyebrow}</p>
        <span className="te-elim-recap__rule" aria-hidden />
      </header>
      <div className="te-elim-recap__stage">
        <div
          className="te-elim-recap__portraits"
          aria-label={isChampion ? "Pareja campeona" : "Pareja subcampeona"}
        >
          {players.map((player) => (
            <div className="te-elim-recap__player" key={player.id}>
              <JugadorAvatar
                fotoUrl={player.fotoUrl}
                nombre={player.name}
                size="xl"
                alt={player.fotoUrl ? `Foto de ${player.name}` : ""}
                className="te-elim-recap__avatar"
              />
              <p>{player.name}</p>
            </div>
          ))}
        </div>
        <div className="te-elim-recap__results">
          <div className="te-elim-recap__hero">
            <p className="te-elim-recap__badge">
              {isChampion ? "1.er lugar" : "2.º lugar"}
            </p>
            <h2 className="te-elim-recap__title">
              <TablerIcon name={isChampion ? "trophy" : "medal"} size={22} />
              {isChampion
                ? "¡Felicidades, campeones!"
                : "¡Felicidades, subcampeones!"}
            </h2>
            <p className="te-elim-recap__message">
              {isChampion
                ? "Se coronaron. Este título es de ustedes, y la próxima toca defenderlo."
                : "Llegaron a la final. Quedaron a un paso, y la próxima van por el título."}
            </p>
          </div>
      {stats ? (
        <div
          className="te-elim-recap__stats"
          aria-label={isChampion ? "Números del campeón" : "Números del subcampeón"}
        >
          <div>
            <span>Games acum.</span>
            <strong>{stats.juegosFavor}</strong>
          </div>
          <div>
            <span>Dif. juegos</span>
            <strong>{formatPublicPodiumDif(stats.dif)}</strong>
          </div>
          <div>
            <span>Partidos ganados</span>
            <strong>{stats.victorias}</strong>
          </div>
          <div>
            <span>Derrotas</span>
            <strong>{stats.derrotas}</strong>
          </div>
        </div>
      ) : null}
      {matches.length > 0 ? (
        <section className="te-elim-recap__matches" aria-label="Enfrentamientos">
          <p>Enfrentamientos</p>
          <div className="te-elim-recap__matches-head" aria-hidden>
            <span>Rival</span>
            <span>Ronda</span>
            <span>Marcador</span>
            <span>Dif</span>
          </div>
          <ul>
            {matches.map((line) => (
              <li key={line.id}>
                <span className="te-elim-recap__rival">
                  <i>vs</i>
                  {line.opponent}
                </span>
                <span className="te-elim-recap__round">{line.round}</span>
                <span className="te-elim-recap__score">{line.score}</span>
                <span className="te-elim-recap__dif">
                  {formatPublicPodiumDif(line.dif)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
        </div>
      </div>
      <footer className="te-elim-recap__footer">
        <span aria-hidden />
        <p>Vive Riviera Open</p>
        <div className="te-elim-recap__social">
          <ul aria-label="Redes sociales Riviera Open">
            {(["tiktok", "instagram", "facebook"] as const).map((id) => {
              const link = RIVIERA_SOCIAL_LINKS.find((item) => item.id === id);
              if (!link) return null;
              return (
                <li key={link.id}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${link.label} ${RIVIERA_SOCIAL_HANDLE}`}
                  >
                    <TablerIcon name={SOCIAL_ICON_BY_ID[link.id]} size={16} />
                  </a>
                </li>
              );
            })}
          </ul>
          <span className="te-elim-recap__handle">{RIVIERA_SOCIAL_HANDLE}</span>
        </div>
      </footer>
    </section>
  );
}

function TournamentClosingStack({
  champion,
  runnerUp,
  thirdPlace,
  tournamentName,
  category,
  clubName,
  clubLogoUrl,
  showMotherAttribution,
  pairStatsById,
  rounds,
}: {
  champion: BracketTeamPresentation;
  runnerUp: BracketTeamPresentation | null;
  thirdPlace: BracketTeamPresentation | null;
  tournamentName: string;
  category?: string | null;
  clubName: string;
  clubLogoUrl?: string | null;
  showMotherAttribution: boolean;
  pairStatsById: Record<string, PublicEliminatoriaPodiumStats | null>;
  rounds: BracketRoundPresentation[];
}) {
  const [sharingPlace, setSharingPlace] = useState<PodiumSharePlace | null>(
    null,
  );
  const statsFor = (team: BracketTeamPresentation) =>
    team.parejaId ? (pairStatsById[team.parejaId] ?? null) : null;
  const presentationFor = (
    team: BracketTeamPresentation,
    place: PodiumSharePlace,
  ) => {
    if (team.kind !== "team") return null;
    return createPodiumSharePresentation({
      place,
      tournamentName,
      category: category ?? null,
      clubName,
      clubLogoUrl: clubLogoUrl ?? null,
      showMotherAttribution,
      players: getTeamPlayers(team).map((player) => ({
        id: player.id,
        name: player.name,
        fotoUrl: player.fotoUrl,
      })),
      stats: statsFor(team),
    });
  };
  const share = async (presentation: ReturnType<typeof presentationFor>) => {
    if (!presentation || sharingPlace) return;
    setSharingPlace(presentation.place);
    try {
      await shareTournamentPodiumImage(presentation);
    } finally {
      setSharingPlace(null);
    }
  };
  const podiums = [
    { team: champion, place: "first" as const },
    ...(runnerUp ? [{ team: runnerUp, place: "second" as const }] : []),
    ...(thirdPlace ? [{ team: thirdPlace, place: "third" as const }] : []),
  ]
    .map(({ team, place }) => ({
      place,
      presentation: presentationFor(team, place),
    }))
    .filter(
      (
        entry,
      ): entry is {
        place: PodiumSharePlace;
        presentation: NonNullable<ReturnType<typeof presentationFor>>;
      } => Boolean(entry.presentation),
    );

  const pairLabel = (place: PodiumSharePlace) => {
    const entry = podiums.find((item) => item.place === place);
    const names = entry?.presentation.players.map((player) => player.name) ?? [];
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  };
  const championNames = pairLabel("first");
  const runnerNames = pairLabel("second");
  const tournamentLabel = [tournamentName, category].filter(Boolean).join(" · ");

  return (
    <div className="te-pb-closing-stack" aria-label="Cierre del torneo">
      <TournamentRecap
        team={champion}
        place="first"
        tournamentName={tournamentName}
        category={category}
        stats={statsFor(champion)}
        rounds={rounds}
      />
      {runnerUp ? (
        <TournamentRecap
          team={runnerUp}
          place="second"
          tournamentName={tournamentName}
          category={category}
          stats={statsFor(runnerUp)}
          rounds={rounds}
        />
      ) : null}
      <div className="te-pb-podium-share-grid">
        {podiums.map(({ place, presentation }) => (
          <TournamentPodiumShareCard
            key={place}
            presentation={presentation}
            onShare={() => void share(presentation)}
            isSharing={sharingPlace === place}
          />
        ))}
      </div>
      <footer className="te-pb-closing-community" aria-label="Resumen del torneo">
        <p className="te-pb-closing-community__kicker">Resumen del torneo</p>
        <h2>Felicidades.</h2>
        {championNames ? (
          <p>
            <strong>{championNames}</strong>
            {tournamentLabel
              ? ` se coronan campeones de ${tournamentLabel}.`
              : " se coronan campeones."}
            {runnerNames ? (
              <>
                {" "}
                <strong>{runnerNames}</strong> cierran como subcampeones.
              </>
            ) : null}
          </p>
        ) : null}
        <p>
          Gracias a todos los jugadores por ser parte del torneo, competir con
          intensidad y hacer crecer esta comunidad.
        </p>
        <strong>
          Esto no termina aquí. Nos vemos en la próxima competencia.
        </strong>
      </footer>
    </div>
  );
}

function BracketRoundColumn({
  round,
  display = "current",
  pairStatsById = {},
}: {
  round: BracketRoundPresentation;
  display?: "history" | "current";
  pairStatsById?: Record<string, PublicEliminatoriaPodiumStats | null>;
}) {
  const isFinal =
    round.isFinalRound || round.matches.some((match) => match.isFinal);
  const pairTeams = round.matches
    .flatMap((match) => [match.local, match.visit])
    .filter((team) => team.kind === "team");
  const champion = isFinal
    ? (pairTeams.find((team) => team.isWinner) ?? null)
    : null;

  return (
    <section
      className={`te-pb-round${
        round.isThirdPlace ? " te-pb-round--third" : ""
      }${isFinal ? " te-pb-round--final" : ""}${
        round.isSemifinal ? " te-pb-round--semis" : ""
      }${round.isCompleted ? " te-pb-round--completed" : ""}${
        display === "history"
          ? " te-pb-round--history"
          : " te-pb-round--current"
      }`}
      data-round={round.id}
      data-display={display}
      aria-label={round.title}
    >
      <header className="te-pb-round__head">
        <div>
          <span
            className={`te-pb-round__marker${
              isFinal ? " te-pb-round__marker--final" : ""
            }${round.isSemifinal ? " te-pb-round__marker--semis" : ""}`}
            aria-hidden
          >
            {isFinal ? "◆" : "●"}
          </span>
          {display === "current" &&
          !champion &&
          (round.isSemifinal || isFinal) ? (
            <span className="te-pb-round__eyebrow">
              {isFinal ? "Etapa final" : "Etapa decisiva"}
            </span>
          ) : null}
          <h3 className="te-pb-round__title">
            {champion
              ? "RESULTADO FINAL"
              : isFinal
                ? "GRAN FINAL"
                : round.title === "CUARTOS"
                  ? "CUARTOS DE FINAL"
                  : round.title}
          </h3>
        </div>
        {round.isThirdPlace && !round.isCompleted ? (
          <p className="te-pb-round__summary">
            Una última batalla por subir al podio.
          </p>
        ) : null}
      </header>

      {display === "current" && !round.isThirdPlace && !champion ? (
        <div className="te-pb-round__editorial">
          {round.isSemifinal ? (
            <>
              <strong>Felicidades, semifinalistas.</strong>
              <p>
                Ya están entre las mejores parejas del torneo. Un partido más
                los separa de la Gran Final.
              </p>
            </>
          ) : (
            <p>
              {isFinal
                ? "Todo el camino conduce hasta aquí. Es momento de definir a los campeones."
                : round.title === "OCTAVOS"
                  ? "El cuadro está abierto. Cada punto empieza a marcar el camino."
                  : "La competencia sube de nivel. Cada partido acerca a una pareja a la definición."}
            </p>
          )}
        </div>
      ) : null}

      <div className="te-pb-round__stack">
        {round.matches.map((match) =>
          display === "current" && (isFinal || round.isThirdPlace) ? (
            <FinalHeroScoreboard
              key={match.id}
              match={match}
              pairStatsById={pairStatsById}
              place={round.isThirdPlace ? "third" : "final"}
            />
          ) : (
            <MatchScoreboard
              key={match.id}
              match={match}
              variant={
                display === "history"
                  ? "history"
                  : round.isSemifinal
                    ? "semifinal"
                    : round.isThirdPlace
                      ? "third"
                      : "standard"
              }
              hideLiveStatus={
                display === "current" &&
                round.matches.length > 1 &&
                round.matches.every((entry) => entry.status === "live")
              }
            />
          ),
        )}
      </div>
    </section>
  );
}

export interface TEPublicBracketVisualProps {
  allCards: PublicMatchupCard[];
  totalRondas: number;
  activeRonda?: number;
  pairPlayersById?: Record<string, PublicRetaPairPlayer[]>;
  tournamentName?: string;
  category?: string | null;
  clubName?: string;
  clubLogoUrl?: string | null;
  showMotherAttribution?: boolean;
  pairStatsById?: Record<string, PublicEliminatoriaPodiumStats | null>;
}

export const TEPublicBracketVisual: React.FC<TEPublicBracketVisualProps> = ({
  allCards,
  totalRondas,
  activeRonda,
  pairPlayersById = {},
  tournamentName = "Torneo",
  category = null,
  clubName = "Riviera Open",
  clubLogoUrl = null,
  showMotherAttribution = false,
  pairStatsById = {},
}) => {
  const presentation = useMemo(
    () =>
      buildBracketPresentationModel(
        allCards,
        totalRondas,
        activeRonda,
        pairPlayersById,
      ),
    [allCards, totalRondas, activeRonda, pairPlayersById],
  );
  const completedChampion =
    presentation.visibleRound?.isFinalRound &&
    presentation.visibleRound.isCompleted
      ? (presentation.visibleRound.matches
          .flatMap((match) => [match.local, match.visit])
          .find((team) => team.kind === "team" && team.isWinner) ?? null)
      : null;
  const completedRunnerUp =
    completedChampion && presentation.visibleRound
      ? (presentation.visibleRound.matches
          .flatMap((match) => [match.local, match.visit])
          .find((team) => team.kind === "team" && team.isLoser) ?? null)
      : null;
  const completedThirdPlace = presentation.visibleThirdPlace?.isCompleted
    ? (presentation.visibleThirdPlace.matches
        .flatMap((match) => [match.local, match.visit])
        .find((team) => team.kind === "team" && team.isWinner) ?? null)
    : null;

  if (allCards.length === 0) {
    return (
      <p className="te-elim-public-empty">
        Aún no hay enfrentamientos publicados.
      </p>
    );
  }

  return (
    <div className="te-pb te-elim-v2">
      <div
        className="te-pb-current-stage"
        aria-label="Etapa actual de la eliminatoria"
      >
        {presentation.visibleRound ? (
          <section
            className={`te-pb-stage te-pb-stage--${presentation.visibleRound.id}`}
            key={presentation.visibleRound.id}
          >
            {presentation.rounds
              .filter((round) => round.ronda < presentation.visibleRound!.ronda)
              .map((round) => (
                <React.Fragment key={round.id}>
                  <BracketRoundColumn
                    round={round}
                    display="history"
                    pairStatsById={pairStatsById}
                  />
                  <div className="te-pb-stage-progression" aria-hidden>
                    <span />
                    <i>●</i>
                  </div>
                </React.Fragment>
              ))}
            <BracketRoundColumn
              round={presentation.visibleRound}
              pairStatsById={pairStatsById}
            />
            {presentation.visibleThirdPlace ? (
              <div className="te-pb-current-stage__third">
                <BracketRoundColumn
                  round={presentation.visibleThirdPlace}
                  pairStatsById={pairStatsById}
                />
              </div>
            ) : null}
            {completedChampion ? (
              <TournamentClosingStack
                champion={completedChampion}
                runnerUp={completedRunnerUp}
                thirdPlace={completedThirdPlace}
                tournamentName={tournamentName}
                category={category}
                clubName={clubName}
                clubLogoUrl={clubLogoUrl}
                showMotherAttribution={showMotherAttribution}
                pairStatsById={pairStatsById}
                rounds={presentation.allRounds}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
};
