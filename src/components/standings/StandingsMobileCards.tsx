import React, { useMemo } from "react";
import {
  computeStandingDif,
  formatStandingDif,
  standingDifCellClass,
} from "../../utils/standingsDisplay";
import {
  getDecidingCriterionBetween,
  type StandingsCriterionKey,
} from "../../utils/standingsCriterionHighlight";
import "../../styles/standings-mobile-cards.css";

export type StandingsMobileCardRow = {
  key: string;
  position: number;
  label: string;
  matchesPlayed: number;
  pg: number;
  pp: number;
  points: number;
  pointsReceived: number;
  puntosTorneo: number;
};

function positionIcon(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

export const StandingsMobileCards: React.FC<{
  rows: StandingsMobileCardRow[];
  decidingCriterion?: StandingsCriterionKey;
}> = ({ rows, decidingCriterion: decidingProp }) => {
  const decidingCriterion = useMemo(() => {
    if (decidingProp) return decidingProp;
    if (rows.length < 2) return "fav" as const;
    return getDecidingCriterionBetween(
      {
        id: rows[0].key,
        fav: rows[0].points,
        con: rows[0].pointsReceived,
        pg: rows[0].pg,
      },
      {
        id: rows[1].key,
        fav: rows[1].points,
        con: rows[1].pointsReceived,
        pg: rows[1].pg,
      }
    );
  }, [rows, decidingProp]);

  if (rows.length === 0) return null;

  return (
    <div className="standings-mobile-cards" role="list" aria-label="Clasificación">
      {rows.map((row) => {
        const dif = computeStandingDif(row.points, row.pointsReceived);
        const isLeader = row.position === 1;

        return (
          <article
            key={row.key}
            className={`standings-mobile-card${isLeader ? " standings-mobile-card--leader" : ""}`}
            role="listitem"
          >
            <header className="standings-mobile-card__head">
              <span className="standings-mobile-card__pos" aria-hidden>
                {positionIcon(row.position) || row.position}
              </span>
              <h3 className="standings-mobile-card__name">{row.label}</h3>
            </header>

            <div className="standings-mobile-card__stats">
              <div
                className={`standings-mobile-card__stat standings-mobile-card__stat--criterion-1${
                  isLeader && decidingCriterion === "fav"
                    ? " standings-mobile-card__stat--deciding"
                    : ""
                }`}
              >
                <span className="standings-mobile-card__stat-label">FAV</span>
                <span className="standings-mobile-card__stat-value">
                  {row.points}
                </span>
              </div>
              <div
                className={`standings-mobile-card__stat standings-mobile-card__stat--criterion-2 standings-mobile-card__stat--dif${
                  isLeader && decidingCriterion === "dif"
                    ? " standings-mobile-card__stat--deciding"
                    : ""
                }`}
              >
                <span className="standings-mobile-card__stat-label">DIF</span>
                <span
                  className={`standings-mobile-card__dif ${standingDifCellClass(dif)}`}
                >
                  {formatStandingDif(dif)}
                </span>
              </div>
              <div
                className={`standings-mobile-card__stat standings-mobile-card__stat--criterion-3${
                  isLeader && decidingCriterion === "pg"
                    ? " standings-mobile-card__stat--deciding"
                    : ""
                }`}
              >
                <span className="standings-mobile-card__stat-label">PG</span>
                <span className="standings-mobile-card__stat-value standings-mobile-card__stat-value--win">
                  {row.pg}
                </span>
              </div>
              <div className="standings-mobile-card__stat">
                <span className="standings-mobile-card__stat-label">PJ</span>
                <span className="standings-mobile-card__stat-value">
                  {row.matchesPlayed}
                </span>
              </div>
              <div className="standings-mobile-card__stat">
                <span className="standings-mobile-card__stat-label">PP</span>
                <span className="standings-mobile-card__stat-value">
                  {row.pp}
                </span>
              </div>
              <div className="standings-mobile-card__stat standings-mobile-card__stat--informative">
                <span className="standings-mobile-card__stat-label">PTS</span>
                <span className="standings-mobile-card__stat-value standings-mobile-card__stat-value--pts">
                  {row.puntosTorneo}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};
