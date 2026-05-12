import React from "react";
import type { AmericanoPlayer } from "../../lib/db/types";
import "./LiveRanking.css";

interface LiveRankingProps {
  players: AmericanoPlayer[];
  /** Texto bajo el título (p. ej. aclarar que no entra la ronda en curso). */
  caption?: string;
}

export const LiveRanking: React.FC<LiveRankingProps> = ({ players, caption }) => {
  return (
    <section className="americano-ranking">
      <h3>Ranking en vivo</h3>
      {caption ? <p className="americano-ranking__caption">{caption}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jugador</th>
            <th>Juegos a favor</th>
            <th>Juegos en contra</th>
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
