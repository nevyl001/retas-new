import React from "react";
import type { AmericanoPlayer, AmericanoRound } from "../../lib/db/types";
import {
  buildAmericanoPlayerStandingStats,
  getAmericanoRanking,
} from "../../lib/americanoStandings";
import {
  computeStandingDif,
  formatStandingDif,
  standingDifCellClass,
} from "../../utils/standingsDisplay";
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
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jugador</th>
            <th>PJ</th>
            <th>PG</th>
            <th>PP</th>
            <th>Pts Fav</th>
            <th>Pts Con</th>
            <th>Dif</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((player, index) => {
            const st = statsMap?.get(player.id);
            const ptsFav = st?.ptsFav ?? player.stats.pointsFor;
            const ptsCon = st?.ptsCon ?? player.stats.pointsAgainst;
            const dif = computeStandingDif(ptsFav, ptsCon);
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
                <td className={standingDifCellClass(dif)}>{formatStandingDif(dif)}</td>
                <td>{st?.puntos ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
