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
        <div className="te-pb-match__divider" aria-hidden />
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

  return (
    <div className="te-pb-closing-stack" aria-label="Cierre del torneo">
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
      <footer className="te-pb-closing-community" aria-label="Agradecimiento">
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
        <p className="te-pb-round__summary">
          {round.isThirdPlace
            ? round.isCompleted
              ? "✓ 3.er lugar definido"
              : "Una última batalla por subir al podio."
            : round.isCompleted
              ? display === "history"
                ? round.isSemifinal
                  ? "✓ Semifinales completadas"
                  : "✓ Completados"
                : "✓ Completado"
              : null}
        </p>
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
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
};
