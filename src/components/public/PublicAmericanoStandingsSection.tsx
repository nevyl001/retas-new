import React, { useMemo } from "react";
import { computeStandingDif } from "../../utils/standingsDisplay";
import type { AmericanoSnapshotPlayer } from "../../lib/americanoDinamicoStorage";

function DifPill({ ptsFav, ptsCon }: { ptsFav: number; ptsCon: number }) {
  const dif = computeStandingDif(ptsFav, ptsCon);
  const mod =
    dif > 0 ? "te-pub-dif--pos" : dif < 0 ? "te-pub-dif--neg" : "te-pub-dif--zero";
  const label = dif > 0 ? `+${dif}` : String(dif);
  return <span className={`te-pub-dif ${mod}`}>{label}</span>;
}

export const PublicAmericanoStandingsSection: React.FC<{
  rows: AmericanoSnapshotPlayer[];
  title?: string;
}> = ({ rows, title = "Clasificación" }) => {
  const staggerBase = useMemo(() => 0.04, []);

  if (rows.length === 0) return null;

  return (
    <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
      <h2 className="te-public-section__title">{title}</h2>
      <div className="te-public-section__divider" aria-hidden />

      <div className="te-pub-standings-table-wrap te-pub-fade-in te-pub-fade-in--delay-1">
        <table className="te-pub-standings-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>JUGADOR</th>
              <th>FAV</th>
              <th>CON</th>
              <th>DIF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isLeader = index === 0;
              const fav = row.stats.pointsFor;
              const con = row.stats.pointsAgainst;
              return (
                <tr
                  key={row.id}
                  className={`te-pub-standings-row te-pub-fade-in-up${
                    isLeader ? " te-pub-standings-row--leader" : ""
                  }`}
                  style={{ animationDelay: `${0.08 + index * staggerBase}s` }}
                >
                  <td className="te-pub-standings-row__pos">
                    <span className="te-pub-standings-row__pos-num">
                      {index + 1}
                    </span>
                  </td>
                  <td className="te-pub-standings-row__name">{row.name}</td>
                  <td>{fav}</td>
                  <td>{con}</td>
                  <td>
                    <DifPill ptsFav={fav} ptsCon={con} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="te-pub-standings-cards">
        {rows.map((row, index) => {
          const isLeader = index === 0;
          const fav = row.stats.pointsFor;
          const con = row.stats.pointsAgainst;
          return (
            <article
              key={`m-${row.id}`}
              className={`te-pub-standing-card te-pub-fade-in-up${
                isLeader ? " te-pub-standing-card--leader" : ""
              }`}
              style={{ animationDelay: `${0.1 + index * staggerBase}s` }}
            >
              <span className="te-pub-standing-card__pos-bg" aria-hidden>
                {index + 1}
              </span>
              <div className="te-pub-standing-card__head">
                <span className="te-pub-standing-card__pos">{index + 1}</span>
                <p className="te-pub-standing-card__name">{row.name}</p>
              </div>
              <div className="te-pub-standing-card__stats">
                <span>
                  <small>FAV</small> {fav}
                </span>
                <span>
                  <small>CON</small> {con}
                </span>
                <span>
                  <small>DIF</small> <DifPill ptsFav={fav} ptsCon={con} />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
