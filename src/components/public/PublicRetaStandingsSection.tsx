import React, { useMemo } from "react";
import { TePubDifPill } from "./tePubShared";
import {
  criterionCellClass,
  criterionHeaderClass,
  getDecidingCriterionBetween,
} from "../../utils/standingsCriterionHighlight";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import type { StandingsHelpMode } from "../../lib/standingsHelpMode";
import { TeamLogo } from "../reta/equipos/TeamLogo";
import "../../styles/standings-scoring-help.css";
import "../../styles/standings-criterion.css";
import "./reta-public-scoreboard.css";

export type PublicRetaStandingRow = {
  id: string;
  name: string;
  pj: number;
  pg: number;
  pp: number;
  fav: number;
  con: number;
  pts: number;
  /** Presentación equipos: logo + acento de bando. */
  logoUrl?: string | null;
  teamIndex?: number | null;
};

export const PublicRetaStandingsSection: React.FC<{
  rows: PublicRetaStandingRow[];
  title?: string;
  entityHeader?: string;
  showScoringHelp?: boolean;
  scoringMode?: StandingsHelpMode;
  /** Leaderboard glass arena (Reta por Equipos). */
  arena?: boolean;
}> = ({
  rows,
  title = "Clasificación",
  entityHeader = "PAREJA",
  showScoringHelp = true,
  scoringMode = "round-robin",
  arena = false,
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

  const table = (
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
            const medalClass =
              index === 0
                ? " te-pub-standings-row--medal-1"
                : index === 1
                  ? " te-pub-standings-row--medal-2"
                  : index === 2
                    ? " te-pub-standings-row--medal-3"
                    : "";
            const sideClass =
              row.teamIndex === 0
                ? " te-pub-standings-row--side-a"
                : row.teamIndex === 1
                  ? " te-pub-standings-row--side-b"
                  : "";
            const showTeamIdentity = row.teamIndex != null || Boolean(row.logoUrl);
            return (
              <tr
                key={row.id}
                className={`te-pub-standings-row te-pub-fade-in-up${
                  isLeader ? " te-pub-standings-row--leader" : ""
                }${medalClass}${sideClass}`}
                style={{ animationDelay: `${0.08 + index * staggerBase}s` }}
              >
                <td className="te-pub-standings-row__pos">
                  <span className="te-pub-standings-row__pos-num">
                    {index + 1}
                  </span>
                </td>
                <td className="te-pub-standings-row__name">
                  {showTeamIdentity ? (
                    <span className="te-pub-standings-row__entity">
                      <TeamLogo
                        logoUrl={row.logoUrl}
                        teamName={row.name}
                        size="sm"
                        className="te-pub-standings-row__logo"
                      />
                      <span className="te-pub-standings-row__label">
                        {row.name}
                      </span>
                    </span>
                  ) : (
                    row.name
                  )}
                </td>
                <td className="te-pub-standings-row__stat">{row.pj}</td>
                <td
                  className={[
                    "te-pub-standings-row__stat",
                    isLeader
                      ? criterionCellClass("pg", leaderDecidingCriterion)
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {row.pg}
                </td>
                <td className="te-pub-standings-row__stat">{row.pp}</td>
                <td
                  className={[
                    "te-pub-standings-row__stat",
                    isLeader
                      ? criterionCellClass("fav", leaderDecidingCriterion)
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {row.fav}
                </td>
                <td className="te-pub-standings-row__stat">{row.con}</td>
                <td
                  className={[
                    "te-pub-standings-row__stat",
                    isLeader
                      ? criterionCellClass("dif", leaderDecidingCriterion)
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
  );

  const cards = (
    <div className="te-pub-standings-cards">
      {rows.map((row, index) => {
        const isLeader = index === 0;
        const medalClass =
          index === 0
            ? " te-pub-standing-card--medal-1"
            : index === 1
              ? " te-pub-standing-card--medal-2"
              : index === 2
                ? " te-pub-standing-card--medal-3"
                : "";
        const sideClass =
          row.teamIndex === 0
            ? " te-pub-standing-card--side-a"
            : row.teamIndex === 1
              ? " te-pub-standing-card--side-b"
              : "";
        const showTeamIdentity = row.teamIndex != null || Boolean(row.logoUrl);
        return (
          <article
            key={`m-${row.id}`}
            className={`te-pub-standing-card te-pub-fade-in-up${
              isLeader ? " te-pub-standing-card--leader" : ""
            }${medalClass}${sideClass}`}
            style={{ animationDelay: `${0.1 + index * staggerBase}s` }}
          >
            <span className="te-pub-standing-card__pos-bg" aria-hidden>
              {index + 1}
            </span>
            <div className="te-pub-standing-card__head">
              <span className="te-pub-standing-card__pos">{index + 1}</span>
              {showTeamIdentity ? (
                <span className="te-pub-standing-card__entity">
                  <TeamLogo
                    logoUrl={row.logoUrl}
                    teamName={row.name}
                    size="sm"
                    className="te-pub-standing-card__logo"
                  />
                  <p className="te-pub-standing-card__name">{row.name}</p>
                </span>
              ) : (
                <p className="te-pub-standing-card__name">{row.name}</p>
              )}
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
  );

  return (
    <section
      className={[
        "te-public-section",
        "te-pub-fade-in",
        "te-pub-fade-in--delay-2",
        arena ? "te-pub-standings--arena" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {arena ? (
        <div className="te-pub-standings-arena">
          <header className="te-pub-standings-arena__head">
            <h2 className="te-public-section__title te-pub-standings-arena__title">
              <span className="te-pub-standings-arena__trophy" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                  <path
                    d="M7 4h10v2.2c0 2.4-1.4 4.5-3.5 5.4v1.2c1.7.4 3 1.9 3 3.7V18H7.5v-1.5c0-1.8 1.3-3.3 3-3.7v-1.2C8.4 10.7 7 8.6 7 6.2V4z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 5.5H4.8A1.8 1.8 0 0 0 3 7.3C3 9.4 4.6 11 6.7 11H7M17 5.5h2.2A1.8 1.8 0 0 1 21 7.3C21 9.4 19.4 11 17.3 11H17M9 20h6"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              {title}
            </h2>
            {showScoringHelp ? (
              <StandingsScoringHelp
                className="te-pub-standings-scoring-help te-pub-standings-arena__order"
                mode={scoringMode}
                compact
              />
            ) : null}
          </header>
          {table}
          {cards}
        </div>
      ) : (
        <>
          <h2 className="te-public-section__title">{title}</h2>
          <div className="te-public-section__divider" aria-hidden />
          {showScoringHelp ? (
            <StandingsScoringHelp
              className="te-pub-standings-scoring-help"
              mode={scoringMode}
            />
          ) : null}
          {table}
          {cards}
        </>
      )}
    </section>
  );
};
