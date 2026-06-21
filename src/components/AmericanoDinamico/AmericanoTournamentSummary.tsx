import React, { useState } from "react";
import type { AmericanoDinamicoSnapshotV1 } from "../../lib/americanoDinamicoStorage";
import { buildPublicPantallaUrl } from "../../lib/publicPantalla";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import { resolveAmericanoRankingFromSnapshot } from "../../lib/americanoSnapshotRoster";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import { StandingsDifCell } from "../standings/StandingsDifCell";
import "./AmericanoTournamentSummary.css";

interface AmericanoTournamentSummaryProps {
  snapshot: AmericanoDinamicoSnapshotV1;
  /** Abre la vista pública para TV / proyector en otra pestaña. */
  tournamentId?: string;
  /** `display`: tipografía grande y todas las rondas desplegadas (solo lectura pública). */
  variant?: "default" | "display";
}

export const AmericanoTournamentSummary: React.FC<
  AmericanoTournamentSummaryProps
> = ({ snapshot, tournamentId, variant = "default" }) => {
  const [openRound, setOpenRound] = useState<number | null>(null);
  const isDisplay = variant === "display";
  const rankedRows = resolveAmericanoRankingFromSnapshot(snapshot);
  const podium = rankedRows.slice(0, 3);
  const totalForPhaseLabels =
    snapshot.totalRounds != null && snapshot.totalRounds > 0
      ? snapshot.totalRounds
      : snapshot.tournamentPhase === "finished" && snapshot.rounds.length > 0
        ? Math.max(...snapshot.rounds.map((r) => r.roundNumber))
        : 0;

  const openResultsBoard = () => {
    if (!tournamentId || typeof window === "undefined") return;
    const url = buildPublicPantallaUrl("americano", tournamentId);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section
      className={`americano-summary${isDisplay ? " americano-summary--display" : ""}`}
      aria-label="Resultados Americano Dinámico"
    >
      <header className="americano-summary__header">
        <div className="americano-summary__header-main">
          <h2 className="americano-summary__title">
            {isDisplay ? "Resumen del torneo" : "Americano Dinámico — resultados"}
          </h2>
          {!isDisplay && tournamentId ? (
            <button
              type="button"
              className="americano-summary__screen-btn"
              onClick={openResultsBoard}
            >
              Ver resultados (pantalla)
            </button>
          ) : null}
        </div>
        {!isDisplay ? (
          <time className="americano-summary__saved" dateTime={snapshot.savedAt}>
            Guardado {new Date(snapshot.savedAt).toLocaleString()}
          </time>
        ) : null}
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
        <StandingsScoringHelp compact />
        <table className="americano-summary__table">
          <thead>
            <tr>
              <th title="Posición">POS</th>
              <th title="Nombre del jugador">JUGADOR</th>
              <th title="Juegos anotados a favor">FAV</th>
              <th title="Juegos recibidos en contra">CON</th>
              <th title="Diferencia (FAV − CON)">DIF</th>
            </tr>
          </thead>
          <tbody>
            {rankedRows.map((player, index) => {
              const ptsFav = player.stats.pointsFor;
              const ptsCon = player.stats.pointsAgainst;
              return (
                <tr
                  key={player.id}
                  className={index === 0 ? "americano-summary__leader" : undefined}
                >
                  <td>{index + 1}</td>
                  <td>{player.name}</td>
                  <td>{ptsFav}</td>
                  <td>{ptsCon}</td>
                  <StandingsDifCell
                    ptsFav={ptsFav}
                    ptsCon={ptsCon}
                    className=""
                  />
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
          snapshot.rounds.map((round) => {
            const roundLabel = (
              <>
                Ronda {round.roundNumber} ·{" "}
                {americanoRoundPhaseCaption(round, totalForPhaseLabels)}
                {round.benchPlayers.length > 0 && (
                  <span className="americano-summary__bench">
                    {" "}
                    (Banquillo: {round.benchPlayers.map((p) => p.name).join(", ")})
                  </span>
                )}
              </>
            );
            const matchesList = (
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
            );
            return (
              <article
                key={`${round.roundNumber}-${round.phase}`}
                className={`americano-summary__round${
                  isDisplay ? " americano-summary__round--display" : ""
                }`}
              >
                {isDisplay ? (
                  <>
                    <h4 className="americano-summary__round-title">{roundLabel}</h4>
                    {matchesList}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="americano-summary__toggle"
                      onClick={() =>
                        setOpenRound((prev) =>
                          prev === round.roundNumber ? null : round.roundNumber
                        )
                      }
                    >
                      {roundLabel}
                    </button>
                    {openRound === round.roundNumber && matchesList}
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};

export default AmericanoTournamentSummary;
