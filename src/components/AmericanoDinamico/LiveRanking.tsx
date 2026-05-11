import React from "react";
import type { AmericanoPlayer } from "../../lib/db/types";
import "./LiveRanking.css";

interface LiveRankingProps {
  players: AmericanoPlayer[];
}

export const LiveRanking: React.FC<LiveRankingProps> = ({ players }) => {
  return (
    <section className="americano-ranking">
      <h3>Ranking en vivo</h3>
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jugador</th>
            <th>PF</th>
            <th>PC</th>
            <th>Dif</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => {
            const diff = player.stats.pointsFor - player.stats.pointsAgainst;
            return (
              <tr key={player.id} className={index === 0 ? "americano-ranking__leader" : ""}>
                <td>{index + 1}</td>
                <td>{player.name}</td>
                <td>{player.stats.pointsFor}</td>
                <td>{player.stats.pointsAgainst}</td>
                <td>{diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
