import React from "react";
import type { AmericanoPlayer, AmericanoRound } from "../../lib/db/types";
import {
  buildAmericanoPlayerStandingStats,
  getAmericanoRanking,
} from "../../lib/americanoStandings";
import { StandingsDifCell } from "../standings/StandingsDifCell";
import { StandingsPtsCell } from "../standings/StandingsPtsCell";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import { StandingsTableHeader } from "../standings/StandingsTableHeader";
import {
  COL_CON,
  COL_ENTITY,
  COL_FAV,
  COL_PG,
  COL_PJ,
  COL_POS,
  COL_PP,
  TABLA_RANKING_CLASS,
  TABLA_WRAPPER_CLASS,
} from "../standings/standingsTableColumns";
import "./LiveRanking.css";

interface LiveRankingProps {
  players: AmericanoPlayer[];
  rounds?: AmericanoRound[];
  /** Texto bajo el título (p. ej. aclarar que no entra la ronda en curso). */
  caption?: string;
}

export const LiveRanking: React.FC<LiveRankingProps> = ({
  players,
  rounds = [],
  caption,
}) => {
  const ranked = getAmericanoRanking(players, rounds);
  const statsMap =
    rounds.length > 0
      ? buildAmericanoPlayerStandingStats(players, rounds)
      : null;

  return (
    <section className="americano-ranking">
      <h3>Ranking en vivo</h3>
      {caption ? <p className="americano-ranking__caption">{caption}</p> : null}
      <StandingsScoringHelp />
      <div
        className={TABLA_WRAPPER_CLASS}
        style={
          {
            "--standings-sticky-bg": "#181818",
            "--standings-sticky-bg-leader": "rgba(255, 214, 0, 0.15)",
          } as React.CSSProperties
        }
      >
        <table className={TABLA_RANKING_CLASS}>
          <thead>
            <StandingsTableHeader entity="jugador" />
          </thead>
          <tbody>
            {ranked.map((player, index) => {
              const st = statsMap?.get(player.id);
              const ptsFav = st?.ptsFav ?? player.stats.pointsFor;
              const ptsCon = st?.ptsCon ?? player.stats.pointsAgainst;
              return (
                <tr
                  key={player.id}
                  className={index === 0 ? "americano-ranking__leader" : ""}
                >
                  <td className={COL_POS}>{index + 1}</td>
                  <td className={COL_ENTITY}>{player.name}</td>
                  <td className={COL_PJ}>
                    {st?.pj ?? player.stats.gamesPlayed}
                  </td>
                  <td className={COL_PG}>{st?.pg ?? 0}</td>
                  <td className={COL_PP}>{st?.pp ?? 0}</td>
                  <td className={COL_FAV}>{ptsFav}</td>
                  <td className={COL_CON}>{ptsCon}</td>
                  <StandingsDifCell ptsFav={ptsFav} ptsCon={ptsCon} className="" />
                  <StandingsPtsCell pts={st?.puntos ?? 0} className="" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
