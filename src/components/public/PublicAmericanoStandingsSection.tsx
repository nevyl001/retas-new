import React, { useMemo } from "react";
import {
  computeStandingDif,
  formatStandingDif,
} from "../../utils/standingsDisplay";
import type { AmericanoSnapshotPlayer } from "../../lib/americanoDinamicoStorage";
import { TablerIcon } from "../ui/TablerIcon";

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

export const PublicAmericanoStandingsSection: React.FC<{
  rows: AmericanoSnapshotPlayer[];
  /** Torneo cerrado: marca al #1 como ganador. */
  isFinished?: boolean;
  /** Si se omite, se deriva de `isFinished`. */
  title?: string;
  /**
   * Filas accionables: abren el desempeño (Fase 2).
   */
  onPlayerSelect?: (playerId: string) => void;
}> = ({ rows, isFinished = false, title, onPlayerSelect }) => {
  const staggerBase = useMemo(() => 0.03, []);
  const resolvedTitle =
    title ?? (isFinished ? "Clasificación" : "Clasificación en vivo");

  if (rows.length === 0) return null;

  return (
    <section
      className="te-public-section am-pub-standings te-pub-fade-in te-pub-fade-in--delay-2"
      aria-label={resolvedTitle}
    >
      <h2 className="te-public-section__title">{resolvedTitle}</h2>
      <div className="te-public-section__divider" aria-hidden />

      <div className="am-pub-standings__panel te-pub-fade-in te-pub-fade-in--delay-1">
        <div className="am-pub-standings__head" aria-hidden>
          <span className="am-pub-standings__col am-pub-standings__col--pos">
            Pos
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--name">
            Jugador
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--pj">
            PJ
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--fav">
            FAV
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--con">
            CON
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--dif">
            DIF
          </span>
          <span className="am-pub-standings__col am-pub-standings__col--go" />
        </div>

        <ul className="am-pub-standings__list">
          {rows.map((row, index) => {
            const pos = index + 1;
            const isLeader = index === 0;
            const showWinner = isFinished && isLeader;
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
                  }${showWinner ? " am-pub-standings__row--winner" : ""}`}
                  style={{ animationDelay: `${0.06 + index * staggerBase}s` }}
                  onClick={() => onPlayerSelect?.(row.id)}
                  aria-label={label}
                >
                  <span className="am-pub-standings__col am-pub-standings__col--pos">
                    <span className="am-pub-standings__pos-num">{pos}</span>
                  </span>

                  <span className="am-pub-standings__col am-pub-standings__col--name">
                    <span className="am-pub-standings__name">{row.name}</span>
                    {showWinner ? (
                      <span className="am-pub-standings__winner-badge">
                        Ganador
                      </span>
                    ) : null}
                    <span className="am-pub-standings__meta-mobile">
                      <span className="am-pub-standings__meta-item">
                        <small>FAV</small> {fav}
                      </span>
                      <span className="am-pub-standings__meta-item">
                        <small>CON</small> {con}
                      </span>
                    </span>
                  </span>

                  <span className="am-pub-standings__col am-pub-standings__col--pj">
                    <span className="am-pub-standings__pj-value">{pj}</span>
                    <small className="am-pub-standings__pj-label">PJ</small>
                  </span>

                  <span className="am-pub-standings__col am-pub-standings__col--fav">
                    {fav}
                  </span>
                  <span className="am-pub-standings__col am-pub-standings__col--con">
                    {con}
                  </span>
                  <span className="am-pub-standings__col am-pub-standings__col--dif">
                    <DifValue ptsFav={fav} ptsCon={con} />
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
