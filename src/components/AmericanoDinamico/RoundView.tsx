import React, { useEffect, useMemo, useState } from "react";
import type { AmericanoMatch, AmericanoRound } from "../../lib/db/types";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import "./RoundView.css";

export interface RoundScorePayload {
  matchId: string;
  scoreA: number;
  scoreB: number;
}

interface RoundViewProps {
  round: AmericanoRound;
  /** Total de rondas del torneo (para mostrar "Final" en la última). */
  totalRounds?: number;
  onCommitRound: (scores: RoundScorePayload[]) => void;
  onRoundFinalized: () => void;
}

function readDraft(
  match: AmericanoMatch,
  drafts: Record<string, { a?: string; b?: string }>
): { a: string; b: string } {
  const d = drafts[match.id];
  return {
    a: d?.a ?? (typeof match.scoreA === "number" ? String(match.scoreA) : ""),
    b: d?.b ?? (typeof match.scoreB === "number" ? String(match.scoreB) : ""),
  };
}

function isDraftComplete(
  round: AmericanoRound,
  drafts: Record<string, { a?: string; b?: string }>
): boolean {
  return round.matches.every((m) => {
    const { a, b } = readDraft(m, drafts);
    const nA = Number(a);
    const nB = Number(b);
    return a !== "" && b !== "" && !Number.isNaN(nA) && !Number.isNaN(nB) && nA >= 0 && nB >= 0;
  });
}

function allMatchesCommitted(round: AmericanoRound): boolean {
  return round.matches.every(
    (m) =>
      typeof m.scoreA === "number" &&
      typeof m.scoreB === "number" &&
      !Number.isNaN(m.scoreA) &&
      !Number.isNaN(m.scoreB) &&
      m.scoreA >= 0 &&
      m.scoreB >= 0
  );
}

function draftsDifferFromCommitted(
  round: AmericanoRound,
  drafts: Record<string, { a?: string; b?: string }>
): boolean {
  return round.matches.some((m) => {
    const { a, b } = readDraft(m, drafts);
    if (typeof m.scoreA !== "number" || typeof m.scoreB !== "number") return false;
    if (a === "" && b === "") return false;
    const nA = Number(a);
    const nB = Number(b);
    if (a !== "" && !Number.isNaN(nA) && nA !== m.scoreA) return true;
    if (b !== "" && !Number.isNaN(nB) && nB !== m.scoreB) return true;
    return false;
  });
}

export const RoundView: React.FC<RoundViewProps> = ({
  round,
  totalRounds = 0,
  onCommitRound,
  onRoundFinalized,
}) => {
  const [draftScores, setDraftScores] = useState<
    Record<string, { a?: string; b?: string }>
  >({});
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  useEffect(() => {
    setDraftScores({});
    setEditingMatchId(null);
  }, [round.roundNumber]);

  const draftComplete = useMemo(
    () => isDraftComplete(round, draftScores),
    [round, draftScores]
  );

  const committed = useMemo(() => allMatchesCommitted(round), [round]);
  const dirty = useMemo(
    () => draftsDifferFromCommitted(round, draftScores),
    [round, draftScores]
  );

  const canFinalizeRound = committed && !dirty;

  const handleConfirm = () => {
    if (!draftComplete) return;
    const scores: RoundScorePayload[] = round.matches.map((m) => {
      const { a, b } = readDraft(m, draftScores);
      return { matchId: m.id, scoreA: Number(a), scoreB: Number(b) };
    });
    onCommitRound(scores);
  };

  return (
    <section className="americano-round">
      <header className="americano-round__header">
        <div>
          <h3>Ronda {round.roundNumber}</h3>
          <span
            className="americano-round__phase"
            title="Rotación americana equilibrada: emparejamientos por costo, sin usar el ranking."
          >
            {americanoRoundPhaseCaption(round, totalRounds) ||
              "Rotación americana"}
          </span>
        </div>
        <p className="americano-round__hint">
          Completa los marcadores, confirma y luego usa{" "}
          <strong>Ronda finalizada</strong> para avanzar.
        </p>
      </header>

      <div className="americano-round__matches">
        {round.matches.map((match) => {
          const { a, b } = readDraft(match, draftScores);
          const isEditing = editingMatchId === match.id;
          return (
            <article key={match.id} className="americano-match-card">
              <div className="americano-match-card__top">
                <span className="americano-match-card__court">
                  Cancha {match.court}
                </span>
                <button
                  type="button"
                  className="americano-match-card__edit-link"
                  onClick={() =>
                    setEditingMatchId((prev) =>
                      prev === match.id ? null : match.id
                    )
                  }
                >
                  {isEditing ? "Cerrar" : "Editar"}
                </button>
              </div>

              <div className="americano-match-card__teams">
                <div className="americano-match-card__team">
                  <span className="americano-match-card__team-label">Equipo A</span>
                  <strong>
                    {match.teamA[0].name} / {match.teamA[1].name}
                  </strong>
                </div>
                <div className="americano-match-card__vs">vs</div>
                <div className="americano-match-card__team">
                  <span className="americano-match-card__team-label">Equipo B</span>
                  <strong>
                    {match.teamB[0].name} / {match.teamB[1].name}
                  </strong>
                </div>
              </div>

              <div
                className={`americano-match-card__scores${
                  isEditing ? " americano-match-card__scores--editing" : ""
                }`}
              >
                <label className="americano-match-card__score-field">
                  <span>Juegos equipo A</span>
                  <input
                    type="number"
                    min={0}
                    value={a}
                    onChange={(e) =>
                      setDraftScores((prev) => ({
                        ...prev,
                        [match.id]: { ...prev[match.id], a: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="americano-match-card__score-field">
                  <span>Juegos equipo B</span>
                  <input
                    type="number"
                    min={0}
                    value={b}
                    onChange={(e) =>
                      setDraftScores((prev) => ({
                        ...prev,
                        [match.id]: { ...prev[match.id], b: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            </article>
          );
        })}
      </div>

      <div className="americano-round__bench card-like">
        <h4>Descansando</h4>
        <div className="americano-round__bench-list">
          {round.benchPlayers.length === 0 ? (
            <span className="americano-round__bench-empty">
              Sin descanso esta ronda
            </span>
          ) : (
            round.benchPlayers.map((player) => (
              <span key={player.id} className="americano-round__bench-player">
                {player.name}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="americano-round__actions">
        <button
          type="button"
          className="americano-round-btn americano-round-btn--secondary"
          onClick={handleConfirm}
          disabled={!draftComplete}
        >
          Confirmar resultados
        </button>
        <button
          type="button"
          className="americano-round-btn americano-round-btn--primary"
          onClick={onRoundFinalized}
          disabled={!canFinalizeRound}
        >
          Ronda finalizada
        </button>
      </div>
      {!draftComplete && (
        <p className="americano-round__footer-hint">
          Completa todos los marcadores (≥ 0) para poder confirmar.
        </p>
      )}
      {dirty && (
        <p className="americano-round__footer-hint">
          Hay cambios sin confirmar. Pulsa <strong>Confirmar resultados</strong>{" "}
          antes de finalizar la ronda.
        </p>
      )}
    </section>
  );
};
