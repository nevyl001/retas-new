import React, { useMemo } from "react";
import {
  computeStandingDif,
  formatStandingDif,
} from "../../utils/standingsDisplay";
import type { AmericanoSnapshotPlayer } from "../../lib/americanoDinamicoStorage";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { TablerIcon } from "../ui/TablerIcon";
import "../jugadores/riviera-jugadores.css";

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
      </header>
      <div className="te-public-section__divider am-pub-standings__divider" aria-hidden />

      <div className="am-pub-standings__panel te-pub-fade-in te-pub-fade-in--delay-1">
        <div className="am-pub-standings__head" aria-hidden>
          <span className="am-pub-standings__col am-pub-standings__col--pos">
            Pos
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--player">
            Jugador
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--stats">
            <span className="am-pub-standings__stat-label">PJ</span>
            <span className="am-pub-standings__stat-label">FAV</span>
            <span className="am-pub-standings__stat-label">CON</span>
            <span className="am-pub-standings__stat-label">DIF</span>
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--go" />
        </div>

        <ul className="am-pub-standings__list">
          {rows.map((row, index) => {
            const pos = index + 1;
            const isLeader = index === 0;
            const showWinner = isFinished && isLeader;
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
              <li key={row.id}>
                <button
                  type="button"
                  className={`am-pub-standings__row te-pub-fade-in-up${
                    isLeader ? " am-pub-standings__row--leader" : ""
                  }${showWinner ? " am-pub-standings__row--winner" : ""}${topClass}`}
                  style={{ animationDelay: `${0.06 + index * staggerBase}s` }}
                  onClick={() => onPlayerSelect?.(row.id)}
                  aria-label={label}
                >
                  <span className="am-pub-standings__col am-pub-standings__col--pos">
                    <span className="am-pub-standings__pos-num">
                      <span className="am-pub-standings__pos-hash" aria-hidden>
                        #
                      </span>
                      {pos}
                    </span>
                  </span>

                  <span className="am-pub-standings__col am-pub-standings__col--player">
                    <span className="am-pub-standings__avatar">
                      <JugadorAvatar
                        fotoUrl={playerFotos?.[row.id] ?? null}
                        nombre={row.name}
                        size="lg"
                        className="am-pub-standings__avatar-img"
                      />
                    </span>
                    <span className="am-pub-standings__identity">
                      <span className="am-pub-standings__name">{row.name}</span>
                      {showWinner ? (
                        <span className="am-pub-standings__winner-badge">
                          Ganador
                        </span>
                      ) : pos <= 3 ? (
                        <span className="am-pub-standings__podium-hint">
                          {pos === 1
                            ? "1.er lugar"
                            : pos === 2
                              ? "2.º lugar"
                              : "3.er lugar"}
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="am-pub-standings__col am-pub-standings__col--stats">
                    <StatCell label="PJ">{pj}</StatCell>
                    <StatCell label="FAV">{fav}</StatCell>
                    <StatCell label="CON">{con}</StatCell>
                    <StatCell label="DIF" emphasize>
                      <DifValue ptsFav={fav} ptsCon={con} />
                    </StatCell>
                  </span>

                  <span
                    className="am-pub-standings__col am-pub-standings__col--go"
                    aria-hidden
                  >
                    <TablerIcon
                      name="chevron-right"
                      size={18}
                      className="am-pub-standings__chevron"
                    />
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
