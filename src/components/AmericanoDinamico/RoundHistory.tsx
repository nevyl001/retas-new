import React, { useState } from "react";
import type { AmericanoRound } from "../../lib/db/types";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import "./RoundHistory.css";

interface RoundHistoryProps {
  rounds: AmericanoRound[];
  /** Total de rondas planificado (etiqueta "Final" en la última). */
  totalRounds?: number;
  onEditScore: (
    roundIndex: number,
    matchId: string,
    scoreA: number,
    scoreB: number
  ) => void;
}

export const RoundHistory: React.FC<RoundHistoryProps> = ({
  rounds,
  totalRounds = 0,
  onEditScore,
}) => {
  const [openRound, setOpenRound] = useState<number | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ a: string; b: string }>({ a: "", b: "" });

  return (
    <section className="americano-history">
      <h3>Historial</h3>
      {rounds.map((round, roundIndex) => {
        const phaseCaption = americanoRoundPhaseCaption(round, totalRounds);
        return (
        <article key={round.roundNumber} className="americano-history__round">
          <button
            className="americano-history__toggle"
            onClick={() =>
              setOpenRound((prev) => (prev === round.roundNumber ? null : round.roundNumber))
            }
          >
            Ronda {round.roundNumber}
            {phaseCaption ? ` · ${phaseCaption}` : ""}
          </button>

          {openRound === round.roundNumber && (
            <div className="americano-history__matches">
              {round.matches.map((match) => (
                <div key={match.id} className="americano-history__match">
                  <span>
                    C{match.court}: {match.teamA[0].name}/{match.teamA[1].name} vs{" "}
                    {match.teamB[0].name}/{match.teamB[1].name}
                  </span>
                  <strong>
                    {typeof match.scoreA === "number" ? match.scoreA : "-"} :{" "}
                    {typeof match.scoreB === "number" ? match.scoreB : "-"}
                  </strong>
                  <button
                    onClick={() => {
                      setEditingMatchId(match.id);
                      setDraft({
                        a: typeof match.scoreA === "number" ? String(match.scoreA) : "0",
                        b: typeof match.scoreB === "number" ? String(match.scoreB) : "0",
                      });
                    }}
                  >
                    Editar
                  </button>

                  {editingMatchId === match.id && (
                    <div className="americano-history__edit">
                      <input
                        type="number"
                        min={0}
                        value={draft.a}
                        onChange={(e) => setDraft((prev) => ({ ...prev, a: e.target.value }))}
                      />
                      <input
                        type="number"
                        min={0}
                        value={draft.b}
                        onChange={(e) => setDraft((prev) => ({ ...prev, b: e.target.value }))}
                      />
                      <button
                        onClick={() => {
                          onEditScore(roundIndex, match.id, Number(draft.a), Number(draft.b));
                          setEditingMatchId(null);
                        }}
                      >
                        Guardar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
        );
      })}
    </section>
  );
};
