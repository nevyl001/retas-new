import React from "react";
import { formatSignedPoints, type ParejaJornadaMatchLine } from "../../lib/liga/jornadaStats";
import { formatPublicPodiumDif } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import type { PublicEliminatoriaPodiumStats } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import type { PublicRetaPairPlayer } from "../public/PublicRetaPairSide";
import { TablerIcon } from "../ui/TablerIcon";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";
import type { PodiumCopyOverrides } from "../torneo-express/public/PodiumCard";
import "./liga-pareja-victoria-celebrate-desktop.css";

function shortOpponent(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 46)}…`;
}

function DesktopPlayerAvatar({ player }: { player: PublicRetaPairPlayer }) {
  return (
    <div className="liga-celebrate-desktop__avatar-shell">
      {player.fotoUrl ? (
        <img
          className="liga-celebrate-desktop__avatar-img"
          src={player.fotoUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="liga-celebrate-desktop__avatar-initial" aria-hidden>
          {getJugadorInitials(player.name)}
        </span>
      )}
    </div>
  );
}

export interface LigaParejaVictoriaCelebrateDesktopProps {
  headline: string;
  copy: PodiumCopyOverrides;
  players: PublicRetaPairPlayer[];
  stats: PublicEliminatoriaPodiumStats;
  matchLines: ParejaJornadaMatchLine[];
  ambient?: React.ReactNode;
}

/** Presentación desktop/tablet grande — composición horizontal editorial. */
export const LigaParejaVictoriaCelebrateDesktop: React.FC<
  LigaParejaVictoriaCelebrateDesktopProps
> = ({ headline, copy, players, stats, matchLines, ambient }) => (
  <section
    className="liga-celebrate-desktop"
    aria-label={`${copy.badge ?? "Ganadores"} — ${copy.rank ?? "1.er lugar"}`}
  >
    <span className="liga-celebrate-desktop__corner liga-celebrate-desktop__corner--tl" aria-hidden />
    <span className="liga-celebrate-desktop__corner liga-celebrate-desktop__corner--tr" aria-hidden />
    <span className="liga-celebrate-desktop__corner liga-celebrate-desktop__corner--bl" aria-hidden />
    <span className="liga-celebrate-desktop__corner liga-celebrate-desktop__corner--br" aria-hidden />

    {ambient ? (
      <div className="liga-celebrate-desktop__ambient" aria-hidden>
        {ambient}
      </div>
    ) : null}

    <div className="liga-celebrate-desktop__inner">
      <header className="liga-celebrate-desktop__header">
        <p className="liga-celebrate-desktop__eyebrow">{headline}</p>
        <div className="liga-celebrate-desktop__gold-line" aria-hidden />
      </header>

      <div className="liga-celebrate-desktop__hero">
        <div className="liga-celebrate-desktop__players-col">
          <p className="liga-celebrate-desktop__section-label">Jugadores ganadores</p>
          <div className="liga-celebrate-desktop__pair" aria-label="Pareja ganadora">
            <div className="liga-celebrate-desktop__player">
              <DesktopPlayerAvatar player={players[0]!} />
              <p className="liga-celebrate-desktop__player-name">{players[0]?.name}</p>
            </div>
            <div className="liga-celebrate-desktop__trophy-wrap" aria-hidden>
              <TablerIcon name="trophy" size={22} className="liga-celebrate-desktop__trophy" />
            </div>
            <div className="liga-celebrate-desktop__player">
              <DesktopPlayerAvatar player={players[1]!} />
              <p className="liga-celebrate-desktop__player-name">{players[1]?.name}</p>
            </div>
          </div>
          <p className="liga-celebrate-desktop__pair-tag">Pareja ganadora</p>
          {copy.message ? (
            <p className="liga-celebrate-desktop__quote">{copy.message}</p>
          ) : null}
        </div>

        <div className="liga-celebrate-desktop__summary-col">
          <p className="liga-celebrate-desktop__badge">{copy.badge ?? "1.ER LUGAR"}</p>
          {copy.title ? (
            <h2 className="liga-celebrate-desktop__title">{copy.title}</h2>
          ) : null}
          {copy.rank ? (
            <p className="liga-celebrate-desktop__rank-line">{copy.rank}</p>
          ) : null}
          <div className="liga-celebrate-desktop__stats" aria-label="Resumen de jornada">
            <div className="liga-celebrate-desktop__stat">
              <span className="liga-celebrate-desktop__stat-label">Victorias</span>
              <span className="liga-celebrate-desktop__stat-value">{stats.victorias}</span>
            </div>
            <div className="liga-celebrate-desktop__stat">
              <span className="liga-celebrate-desktop__stat-label">Derrotas</span>
              <span className="liga-celebrate-desktop__stat-value liga-celebrate-desktop__stat-value--muted">
                {stats.derrotas}
              </span>
            </div>
            <div className="liga-celebrate-desktop__stat">
              <span className="liga-celebrate-desktop__stat-label">Partidos</span>
              <span className="liga-celebrate-desktop__stat-value">{stats.partidos}</span>
            </div>
            <div className="liga-celebrate-desktop__stat">
              <span className="liga-celebrate-desktop__stat-label">Dif. juegos</span>
              <span className="liga-celebrate-desktop__stat-value">
                {formatPublicPodiumDif(stats.dif)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {matchLines.length > 0 ? (
        <section
          className="liga-celebrate-desktop__matches"
          aria-label="Enfrentamientos de la jornada"
        >
          <p className="liga-celebrate-desktop__matches-title">Enfrentamientos</p>
          <div className="liga-celebrate-desktop__matches-head" aria-hidden>
            <span>Rival</span>
            <span>Marcador</span>
            <span>Pts</span>
          </div>
          <ul className="liga-celebrate-desktop__matches-list">
            {matchLines.map((line) => (
              <li key={line.partidoId} className="liga-celebrate-desktop__matches-row">
                <div className="liga-celebrate-desktop__matches-rival">
                  <span className="liga-celebrate-desktop__matches-vs">vs</span>
                  <span
                    className="liga-celebrate-desktop__matches-name"
                    title={line.opponentLabel}
                  >
                    {shortOpponent(line.opponentLabel ?? "Rival")}
                  </span>
                  {line.cancha != null ? (
                    <span className="liga-celebrate-desktop__matches-cancha">
                      C{line.cancha}
                    </span>
                  ) : null}
                </div>
                <span className="liga-celebrate-desktop__matches-score">
                  {line.scoreLabel}
                </span>
                <span className="liga-celebrate-desktop__matches-pts">
                  {formatSignedPoints(line.points)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="liga-celebrate-desktop__footer">
        <span className="liga-celebrate-desktop__footer-line" aria-hidden />
        <p className="liga-celebrate-desktop__footer-tagline">Vive Riviera Open</p>
      </footer>
    </div>
  </section>
);
