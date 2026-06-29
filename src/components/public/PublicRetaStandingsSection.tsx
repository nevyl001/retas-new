import React, { useMemo } from "react";
import { TePubDifPill } from "./tePubShared";
import {
  criterionCellClass,
  criterionHeaderClass,
  getDecidingCriterionBetween,
} from "../../utils/standingsCriterionHighlight";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import type { StandingsHelpMode } from "../../lib/standingsHelpMode";
import "../../styles/standings-scoring-help.css";
import "../../styles/standings-criterion.css";

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
  showScoringHelp?: boolean;
  scoringMode?: StandingsHelpMode;
}> = ({
  rows,
  title = "Clasificación",
  entityHeader = "PAREJA",
  showScoringHelp = true,
  scoringMode = "round-robin",
}) => {
  const staggerBase = useMemo(() => 0.04, []);

  const leaderDecidingCriterion = useMemo(() => {
    if (rows.length < 2) return "fav" as const;
    return getDecidingCriterionBetween(
      {
        id: rows[0].id,
        fav: rows[0].fav,
        con: rows[0].con,
        pg: rows[0].pg,
      },
      {
        id: rows[1].id,
        fav: rows[1].fav,
        con: rows[1].con,
        pg: rows[1].pg,
      }
    );
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
      <h2 className="te-public-section__title">{title}</h2>
      <div className="te-public-section__divider" aria-hidden />

      {showScoringHelp ? (
        <StandingsScoringHelp
          className="te-pub-standings-scoring-help"
          mode={scoringMode}
        />
      ) : null}

      <div className="te-pub-standings-table-wrap standings-table-desktop te-pub-fade-in te-pub-fade-in--delay-1">
        <table className="te-pub-standings-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>{entityHeader}</th>
              <th>PJ</th>
              <th className={criterionHeaderClass("pg")} title="3.er criterio">
                PG
              </th>
              <th>PP</th>
              <th className={criterionHeaderClass("fav")} title="1.er criterio">
                FAV
              </th>
              <th>CON</th>
              <th className={criterionHeaderClass("dif")} title="2.º criterio">
                DIF
              </th>
              <th className="standings-col-informative" title="Solo informativo">
                PTS
              </th>
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
                  <td
                    className={
                      isLeader
                        ? criterionCellClass("pg", leaderDecidingCriterion)
                        : undefined
                    }
                  >
                    {row.pg}
                  </td>
                  <td>{row.pp}</td>
                  <td
                    className={
                      isLeader
                        ? criterionCellClass("fav", leaderDecidingCriterion)
                        : undefined
                    }
                  >
                    {row.fav}
                  </td>
                  <td>{row.con}</td>
                  <td
                    className={
                      isLeader
                        ? criterionCellClass("dif", leaderDecidingCriterion)
                        : undefined
                    }
                  >
                    <TePubDifPill ptsFav={row.fav} ptsCon={row.con} />
                  </td>
                  <td className="te-pub-standings-row__pts standings-col-informative">
                    {row.pts}
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
                <span className="te-pub-standing-card__criterion-fav">
                  {row.fav} FAV
                </span>
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
