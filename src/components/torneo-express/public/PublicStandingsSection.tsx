import React, { useMemo } from "react";
import { computeStandingDif } from "../../../utils/standingsDisplay";
import type { StandingRowExpress } from "../../../lib/torneoExpress/types";
import { PublicStandingsScoringHelp } from "./PublicStandingsScoringHelp";

function DifPill({ ptsFav, ptsCon }: { ptsFav: number; ptsCon: number }) {
  const dif = computeStandingDif(ptsFav, ptsCon);
  const mod =
    dif > 0 ? "te-pub-dif--pos" : dif < 0 ? "te-pub-dif--neg" : "te-pub-dif--zero";
  const label = dif > 0 ? `+${dif}` : String(dif);
  return <span className={`te-pub-dif ${mod}`}>{label}</span>;
}

export const PublicStandingsSection: React.FC<{
  rows: StandingRowExpress[];
  showGrupoColumn?: boolean;
  title?: string;
}> = ({ rows, showGrupoColumn = false, title = "Clasificación" }) => {
  const staggerBase = useMemo(() => 0.04, []);

  if (rows.length === 0) {
    return (
      <section className="te-public-section te-pub-fade-in">
        <h2 className="te-public-section__title">{title}</h2>
        <p className="te-public-empty">Sin datos de clasificación.</p>
      </section>
    );
  }

  return (
    <section className="te-public-section te-pub-fade-in">
      <h2 className="te-public-section__title">{title}</h2>
      <div className="te-public-section__divider" aria-hidden />

      <PublicStandingsScoringHelp />

      <div className="te-pub-standings-table-wrap te-pub-fade-in te-pub-fade-in--delay-1">
        <table className="te-pub-standings-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>PAREJA</th>
              {showGrupoColumn && <th>GRUPO</th>}
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
                  key={`${row.grupoId}-${row.parejaId}`}
                  className={`te-pub-standings-row te-pub-fade-in-up${
                    isLeader ? " te-pub-standings-row--leader" : ""
                  }`}
                  style={{ animationDelay: `${0.08 + index * staggerBase}s` }}
                >
                  <td className="te-pub-standings-row__pos">
                    <span className="te-pub-standings-row__pos-num">{index + 1}</span>
                  </td>
                  <td className="te-pub-standings-row__name">{row.parejaLabel}</td>
                  {showGrupoColumn && (
                    <td>
                      <span className="te-pub-grupo-chip">{row.grupoNombre}</span>
                    </td>
                  )}
                  <td>{row.pj}</td>
                  <td>{row.pg}</td>
                  <td>{row.pp}</td>
                  <td>{row.ptsFav}</td>
                  <td>{row.ptsCon}</td>
                  <td>
                    <DifPill ptsFav={row.ptsFav} ptsCon={row.ptsCon} />
                  </td>
                  <td className="te-pub-standings-row__pts">{row.puntos}</td>
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
              key={`m-${row.grupoId}-${row.parejaId}`}
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
                <div className="te-pub-standing-card__name-wrap">
                  <p className="te-pub-standing-card__name">{row.parejaLabel}</p>
                  {showGrupoColumn && (
                    <span className="te-pub-grupo-chip">{row.grupoNombre}</span>
                  )}
                </div>
                <span className="te-pub-standing-card__pts">{row.puntos} pts</span>
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
                  <small>FAV</small> {row.ptsFav}
                </span>
                <span>
                  <small>CON</small> {row.ptsCon}
                </span>
                <span>
                  <small>DIF</small>{" "}
                  <DifPill ptsFav={row.ptsFav} ptsCon={row.ptsCon} />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
