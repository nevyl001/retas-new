import React, { useEffect, useMemo, useState } from "react";
import type { AmericanoPlayer, AmericanoRound } from "../../lib/db/types";
import { formatMatchCourtLabel } from "../../lib/matchCourt";
import {
  AMERICANO_ROUND_STATUS_LABEL,
  buildAmericanoPlayerJourney,
  deriveAmericanoRoundStatus,
  type AmericanoPlayerRoundCell,
} from "../../lib/americanoPlayerJourney";
import { RoundView } from "./RoundView";
import "./AmericanoRoundsPanel.css";

interface AmericanoRoundsPanelProps {
  rounds: AmericanoRound[];
  currentRoundIndex: number;
  totalRounds: number;
  phase: "registration" | "playing" | "finished";
  roster: AmericanoPlayer[];
  playerFotos?: Record<string, string | null>;
  onCommitRound: (scores: { matchId: string; scoreA: number; scoreB: number }[]) => void;
  onRoundFinalized: () => void;
  roundSyncPending?: boolean;
  roundSyncError?: string | null;
}

function cellSummary(cell: AmericanoPlayerRoundCell): string {
  if (cell.kind === "bench") return "Descansa";
  if (cell.kind === "pending") return "Pendiente";
  const rivals = (cell.rivalNames ?? []).filter(Boolean).join(" / ");
  return [
    cell.court != null ? formatMatchCourtLabel(cell.court) : "Cancha",
    cell.partnerName ? `con ${cell.partnerName}` : "",
    rivals ? `vs ${rivals}` : "",
    cell.result != null
      ? `${cell.scoreFavor}–${cell.scoreContra} ${cell.result}`
      : "Sin marcador",
  ]
    .filter(Boolean)
    .join(" · ");
}

function CellDetail({ cell }: { cell: AmericanoPlayerRoundCell }) {
  if (cell.kind === "bench") {
    return <p className="am-journey__detail">Descansa</p>;
  }
  if (cell.kind === "pending") {
    return <p className="am-journey__detail">Pendiente</p>;
  }
  return (
    <div className="am-journey__detail">
      <p>{cell.court != null ? formatMatchCourtLabel(cell.court) : "Cancha"}</p>
      <p>Compañero: {cell.partnerName || "—"}</p>
      <p>
        Rivales: {cell.rivalNames?.[0] || "—"}
        {cell.rivalNames?.[1] ? ` y ${cell.rivalNames[1]}` : ""}
      </p>
      <p>
        {cell.result != null
          ? `${cell.scoreFavor}–${cell.scoreContra} · ${cell.result}`
          : "Sin marcador"}
      </p>
    </div>
  );
}

export const AmericanoRoundsPanel: React.FC<AmericanoRoundsPanelProps> = ({
  rounds,
  currentRoundIndex,
  totalRounds,
  phase,
  roster,
  playerFotos,
  onCommitRound,
  onRoundFinalized,
  roundSyncPending,
  roundSyncError,
}) => {
  const [view, setView] = useState<"round" | "player">("round");
  const [selectedRound, setSelectedRound] = useState(currentRoundIndex);

  useEffect(() => {
    setSelectedRound(currentRoundIndex);
  }, [currentRoundIndex]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const safeIndex = Math.min(
    Math.max(selectedRound, 0),
    Math.max(rounds.length - 1, 0)
  );
  const round = rounds[safeIndex] ?? null;
  const isCurrent = safeIndex === currentRoundIndex && phase === "playing";

  const journeys = useMemo(() => {
    return roster.map((player) => ({
      player,
      cells: buildAmericanoPlayerJourney(player.id, rounds, totalRounds),
    }));
  }, [roster, rounds, totalRounds]);

  const selected = journeys.find((row) => row.player.id === selectedPlayerId) ?? null;
  const columnCount = journeys[0]?.cells.length ?? 0;

  if (!round) {
    return <p className="americano-screen__loading">Preparando ronda…</p>;
  }

  return (
    <div className="am-rounds">
      <div className="am-rounds__tabs" role="tablist" aria-label="Vista de rondas">
        <button
          type="button"
          role="tab"
          aria-selected={view === "round"}
          className={view === "round" ? "is-active" : ""}
          onClick={() => setView("round")}
        >
          Por ronda
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "player"}
          className={view === "player" ? "is-active" : ""}
          onClick={() => setView("player")}
        >
          Por jugador
        </button>
      </div>

      {view === "round" ? (
        <>
          <div className="am-rounds__nav" role="tablist" aria-label="Rondas generadas">
            {rounds.map((item, index) => {
              const status = deriveAmericanoRoundStatus(item, {
                isCurrent: index === currentRoundIndex && phase === "playing",
                tournamentFinished: phase === "finished",
              });
              return (
                <button
                  key={item.roundNumber}
                  type="button"
                  role="tab"
                  aria-selected={index === safeIndex}
                  className={index === safeIndex ? "is-active" : ""}
                  onClick={() => setSelectedRound(index)}
                >
                  <span>R{item.roundNumber}</span>
                  <small>{AMERICANO_ROUND_STATUS_LABEL[status]}</small>
                </button>
              );
            })}
          </div>
          <RoundView
            key={round.roundNumber}
            round={round}
            totalRounds={totalRounds}
            readOnly={!isCurrent}
            onCommitRound={onCommitRound}
            onRoundFinalized={onRoundFinalized}
            roundSyncPending={roundSyncPending}
            roundSyncError={roundSyncError}
            playerFotos={playerFotos}
          />
        </>
      ) : (
        <div className="am-journey">
          <div className="am-journey__table-wrap">
            <table className="am-journey__table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  {Array.from({ length: columnCount }, (_, index) => (
                    <th key={index}>R{index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journeys.map(({ player, cells }) => (
                  <tr
                    key={player.id}
                    className={
                      player.id === selectedPlayerId ? "is-selected" : ""
                    }
                  >
                    <th scope="row">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPlayerId((current) =>
                            current === player.id ? null : player.id
                          )
                        }
                      >
                        {player.name}
                      </button>
                    </th>
                    {cells.map((cell) => (
                      <td key={`${player.id}-${cell.roundNumber}`}>
                        {cellSummary(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="am-journey__cards">
            {journeys.map(({ player, cells }) => (
              <details key={player.id} className="am-journey__card">
                <summary>{player.name}</summary>
                <ol>
                  {cells.map((cell) => (
                    <li key={`${player.id}-m-${cell.roundNumber}`}>
                      <strong>R{cell.roundNumber}</strong>
                      <CellDetail cell={cell} />
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>

          {selected ? (
            <aside className="am-journey__panel" aria-label={`Recorrido de ${selected.player.name}`}>
              <h4>{selected.player.name}</h4>
              <ol>
                {selected.cells.map((cell) => (
                  <li key={`${selected.player.id}-p-${cell.roundNumber}`}>
                    <strong>R{cell.roundNumber}</strong>
                    <CellDetail cell={cell} />
                  </li>
                ))}
              </ol>
            </aside>
          ) : (
            <p className="am-journey__hint">
              Elige un jugador para ver su recorrido completo.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
