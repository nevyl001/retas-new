import React, { useMemo } from "react";
import {
  computeStandingDif,
  formatStandingDif,
} from "../../utils/standingsDisplay";
import type { AmericanoSnapshotPlayer } from "../../lib/americanoDinamicoStorage";
import { useRetryableImage } from "../../hooks/useRetryableImage";
import { isPhotographicSplitVsFoto } from "../liga/jornada-public/ligaJornadaMatchNames";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";

function DifValue({ ptsFav, ptsCon }: { ptsFav: number; ptsCon: number }) {
  const dif = computeStandingDif(ptsFav, ptsCon);
  const mod =
    dif > 0 ? "te-pub-dif--pos" : dif < 0 ? "te-pub-dif--neg" : "te-pub-dif--zero";
  return (
    <span className={`te-pub-dif am-pub-standings__dif ${mod}`}>
      {formatStandingDif(dif)}
    </span>
  );
}

function StatCell({
  label,
  children,
  emphasize,
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <span
      className={`am-pub-standings__stat${
        emphasize ? " am-pub-standings__stat--dif" : ""
      }`}
    >
      <small className="am-pub-standings__stat-label">{label}</small>
      <span className="am-pub-standings__stat-value">{children}</span>
    </span>
  );
}

function StandingCardMedia({
  name,
  fotoUrl,
}: {
  name: string;
  fotoUrl?: string | null;
}) {
  const photoCandidate = isPhotographicSplitVsFoto(fotoUrl) ? fotoUrl : null;
  const { src, onError } = useRetryableImage(photoCandidate);
  const initials = getJugadorInitials(name);

  return (
    <span
      className={`am-pub-standings__media${
        src ? " am-pub-standings__media--photo" : " am-pub-standings__media--fallback"
      }`}
      aria-hidden
    >
      {src ? (
        <img
          className="am-pub-standings__photo"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={onError}
        />
      ) : (
        <span className="am-pub-standings__initials">{initials}</span>
      )}
    </span>
  );
}

function podiumHint(pos: number): string | null {
  if (pos === 1) return "1.er lugar";
  if (pos === 2) return "2.º lugar";
  if (pos === 3) return "3.er lugar";
  return null;
}

export const PublicAmericanoStandingsSection: React.FC<{
  rows: AmericanoSnapshotPlayer[];
  /** Torneo cerrado: marca al #1 como ganador. */
  isFinished?: boolean;
  /** Si se omite, se deriva de `isFinished`. */
  title?: string;
  /** Fotos resueltas por id de jugador (vista pública). */
  playerFotos?: Record<string, string | null>;
  /**
   * Filas accionables: abren el desempeño (Fase 2).
   */
  onPlayerSelect?: (playerId: string) => void;
}> = ({
  rows,
  isFinished = false,
  title,
  playerFotos,
  onPlayerSelect,
}) => {
  const staggerBase = useMemo(() => 0.03, []);
  const resolvedTitle =
    title ?? (isFinished ? "Clasificación" : "Clasificación en vivo");

  if (rows.length === 0) return null;

  return (
    <section
      className="te-public-section am-pub-standings te-pub-fade-in te-pub-fade-in--delay-2"
      aria-label={resolvedTitle}
    >
      <header className="am-pub-standings__intro">
        <div className="am-pub-standings__intro-copy">
          <h2 className="te-public-section__title am-pub-standings__title">
            {resolvedTitle}
          </h2>
          <p className="am-pub-standings__lede">
            {rows.length} jugador{rows.length === 1 ? "" : "es"}
          </p>
        </div>
        <p className="am-pub-standings__legend" aria-hidden>
          <span>PJ</span>
          <span>FAV</span>
          <span>CON</span>
          <span>DIF</span>
        </p>
      </header>
      <div
        className="te-public-section__divider am-pub-standings__divider"
        aria-hidden
      />

      <div className="am-pub-standings__panel te-pub-fade-in te-pub-fade-in--delay-1">
        <ul className="am-pub-standings__grid">
          {rows.map((row, index) => {
            const pos = index + 1;
            const isLeader = index === 0;
            const showWinner = isFinished && isLeader;
            const hint = showWinner ? null : podiumHint(pos);
            const topClass =
              pos === 1
                ? " am-pub-standings__row--top-1"
                : pos === 2
                  ? " am-pub-standings__row--top-2"
                  : pos === 3
                    ? " am-pub-standings__row--top-3"
                    : "";
            const fav = row.stats.pointsFor;
            const con = row.stats.pointsAgainst;
            const pj = row.stats.gamesPlayed;
            const label = showWinner
              ? `${pos}. ${row.name}, ganador. Ver desempeño`
              : `${pos}. ${row.name}. Ver desempeño`;

            return (
              <li key={row.id} className="am-pub-standings__cell">
                <button
                  type="button"
                  className={`am-pub-standings__row am-pub-standings__card te-pub-fade-in-up${
                    isLeader ? " am-pub-standings__row--leader" : ""
                  }${
                    showWinner ? " am-pub-standings__row--winner" : ""
                  }${topClass}`}
                  style={{ animationDelay: `${0.06 + index * staggerBase}s` }}
                  onClick={() => onPlayerSelect?.(row.id)}
                  aria-label={label}
                >
                  <StandingCardMedia
                    name={row.name}
                    fotoUrl={playerFotos?.[row.id]}
                  />
                  <span className="am-pub-standings__scrim" aria-hidden />

                  <span className="am-pub-standings__pos">
                    <span className="am-pub-standings__pos-num">
                      <span className="am-pub-standings__pos-hash" aria-hidden>
                        #
                      </span>
                      {pos}
                    </span>
                  </span>

                  <span className="am-pub-standings__body">
                    <span className="am-pub-standings__identity">
                      <span className="am-pub-standings__name" title={row.name}>
                        {row.name}
                      </span>
                      {showWinner ? (
                        <span className="am-pub-standings__winner-badge">
                          Ganador
                        </span>
                      ) : hint ? (
                        <span className="am-pub-standings__podium-hint">
                          {hint}
                        </span>
                      ) : null}
                    </span>

                    <span className="am-pub-standings__stats">
                      <StatCell label="PJ">{pj}</StatCell>
                      <StatCell label="FAV">{fav}</StatCell>
                      <StatCell label="CON">{con}</StatCell>
                      <StatCell label="DIF" emphasize>
                        <DifValue ptsFav={fav} ptsCon={con} />
                      </StatCell>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
