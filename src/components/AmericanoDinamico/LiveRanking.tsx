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
      <table>
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
                <td>{index + 1}</td>
                <td>{player.name}</td>
                <td>{st?.pj ?? player.stats.gamesPlayed}</td>
                <td>{st?.pg ?? 0}</td>
                <td>{st?.pp ?? 0}</td>
                <td>{ptsFav}</td>
                <td>{ptsCon}</td>
                <StandingsDifCell ptsFav={ptsFav} ptsCon={ptsCon} className="" />
                <StandingsPtsCell pts={st?.puntos ?? 0} className="" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
