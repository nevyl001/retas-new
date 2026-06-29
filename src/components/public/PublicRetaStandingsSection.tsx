import React, { useMemo } from "react";
import { TePubDifPill } from "./tePubShared";

export type PublicRetaStandingRow = {
  id: string;
  name: string;
  pj: number;
  pg: number;
  pp: number;
  fav: number;
  con: number;
  pts: number;
};

export const PublicRetaStandingsSection: React.FC<{
  rows: PublicRetaStandingRow[];
  title?: string;
  entityHeader?: string;
  scrollHint?: boolean;
}> = ({
  rows,
  title = "Clasificación",
  entityHeader = "PAREJA",
  scrollHint = false,
}) => {
  const staggerBase = useMemo(() => 0.04, []);

  if (rows.length === 0) return null;

  return (
    <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
      <h2 className="te-public-section__title">{title}</h2>
      <div className="te-public-section__divider" aria-hidden />

      {scrollHint ? (
        <p className="te-pub-standings-scroll-hint" aria-hidden>
          Desliza → para ver todas las columnas
        </p>
      ) : null}

      <div className="te-pub-standings-table-wrap standings-table-desktop te-pub-fade-in te-pub-fade-in--delay-1">
        <table className="te-pub-standings-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>{entityHeader}</th>
              <th>PJ</th>
              <th>PG</th>
              <th>PP</th>
              <th>FAV</th>
              <th>CON</th>
              <th>DIF</th>
              <th>PTS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isLeader = index === 0;
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
                  <td>{row.pj}</td>
                  <td>{row.pg}</td>
                  <td>{row.pp}</td>
                  <td>{row.fav}</td>
                  <td>{row.con}</td>
                  <td>
                    <TePubDifPill ptsFav={row.fav} ptsCon={row.con} />
                  </td>
                  <td className="te-pub-standings-row__pts">{row.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="te-pub-standings-cards">
        {rows.map((row, index) => {
          const isLeader = index === 0;
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
                <span className="te-pub-standing-card__pts">{row.pts} pts</span>
              </div>
              <div className="te-pub-standing-card__stats">
                <span>
                  <small>PJ</small> {row.pj}
                </span>
                <span>
                  <small>PG</small> {row.pg}
                </span>
                <span>
                  <small>PP</small> {row.pp}
                </span>
                <span>
                  <small>FAV</small> {row.fav}
                </span>
                <span>
                  <small>CON</small> {row.con}
                </span>
                <span>
                  <small>DIF</small>{" "}
                  <TePubDifPill ptsFav={row.fav} ptsCon={row.con} />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
