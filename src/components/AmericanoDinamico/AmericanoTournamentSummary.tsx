import React, { useState } from "react";
import type { AmericanoDinamicoSnapshotV1 } from "../../lib/americanoDinamicoStorage";
import "./AmericanoTournamentSummary.css";

interface AmericanoTournamentSummaryProps {
  snapshot: AmericanoDinamicoSnapshotV1;
}

export const AmericanoTournamentSummary: React.FC<
  AmericanoTournamentSummaryProps
> = ({ snapshot }) => {
  const [openRound, setOpenRound] = useState<number | null>(null);
  const podium = snapshot.ranking.slice(0, 3);

  return (
    <section className="americano-summary" aria-label="Resultados Americano Dinámico">
      <header className="americano-summary__header">
        <h2 className="americano-summary__title">Americano Dinámico — resultados</h2>
        <time className="americano-summary__saved" dateTime={snapshot.savedAt}>
          Guardado {new Date(snapshot.savedAt).toLocaleString()}
        </time>
      </header>

      {podium.length > 0 && (
        <div className="americano-summary__podium">
          {podium[0] && (
            <div className="americano-summary__medal americano-summary__medal--gold">
              <span>1</span>
              <strong>{podium[0].name}</strong>
            </div>
          )}
          {podium[1] && (
            <div className="americano-summary__medal americano-summary__medal--silver">
              <span>2</span>
              <strong>{podium[1].name}</strong>
            </div>
          )}
          {podium[2] && (
            <div className="americano-summary__medal americano-summary__medal--bronze">
              <span>3</span>
              <strong>{podium[2].name}</strong>
            </div>
          )}
        </div>
      )}

      <div className="americano-summary__ranking-wrap">
        <h3 className="americano-summary__subtitle">Clasificación final</h3>
        <table className="americano-summary__table">
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
            {snapshot.ranking.map((player, index) => {
              const diff = player.stats.pointsFor - player.stats.pointsAgainst;
              return (
                <tr
                  key={player.id}
                  className={index === 0 ? "americano-summary__leader" : undefined}
                >
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
      </div>

      <div className="americano-summary__history">
        <h3 className="americano-summary__subtitle">Partidos por ronda</h3>
        {snapshot.rounds.length === 0 ? (
          <p className="americano-summary__empty">No hay rondas guardadas.</p>
        ) : (
          snapshot.rounds.map((round) => (
            <article key={round.roundNumber} className="americano-summary__round">
              <button
                type="button"
                className="americano-summary__toggle"
                onClick={() =>
                  setOpenRound((prev) =>
                    prev === round.roundNumber ? null : round.roundNumber
                  )
                }
              >
                Ronda {round.roundNumber} · Fase {round.phase}
                {round.benchPlayers.length > 0 && (
                  <span className="americano-summary__bench">
                    {" "}
                    (Banquillo: {round.benchPlayers.map((p) => p.name).join(", ")})
                  </span>
                )}
              </button>
              {openRound === round.roundNumber && (
                <ul className="americano-summary__matches">
                  {round.matches.map((m) => (
                    <li key={m.id} className="americano-summary__match">
                      <span className="americano-summary__court">C{m.court}</span>
                      <span className="americano-summary__teams">
                        {m.teamA[0].name}/{m.teamA[1].name} vs {m.teamB[0].name}/
                        {m.teamB[1].name}
                      </span>
                      <span className="americano-summary__score">
                        {typeof m.scoreA === "number" ? m.scoreA : "—"} :{" "}
                        {typeof m.scoreB === "number" ? m.scoreB : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default AmericanoTournamentSummary;
