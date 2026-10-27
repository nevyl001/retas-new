import React, { useEffect, useState } from "react";
import type { AmericanoRound } from "../../lib/db/types";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import { formatMatchCourtLabel, sortByMatchCourt } from "../../lib/matchCourt";
import {
  parseAmericanoScore,
  type AmericanoEditScoreResult,
} from "../../lib/americanoScoreEdit";
import { isAmericanoMatchScored } from "../../lib/americanoPlayerJourney";
import { AmericanoCourtBoard, AmericanoPairMark } from "../americano/AmericanoCourtBoard";
import { Button, Modal } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import "./RoundHistory.css";

interface RoundHistoryProps {
  rounds: AmericanoRound[];
  totalRounds?: number;
  phase?: "registration" | "playing" | "finished";
  playerFotos?: Record<string, string | null>;
  /** Ausente en vistas de solo lectura: no se muestra el lápiz. */
  onEditScore?: (
    roundIndex: number,
    matchId: string,
    scoreA: number,
    scoreB: number
  ) => Promise<AmericanoEditScoreResult> | AmericanoEditScoreResult;
}

interface EditingSide {
  id: string;
  name: string;
  fotoUrl?: string | null;
}

interface EditingMatch {
  roundIndex: number;
  roundNumber: number;
  matchId: string;
  court: number;
  sideA: [EditingSide, EditingSide];
  sideB: [EditingSide, EditingSide];
  scoreA: string;
  scoreB: string;
}

function pairNames(players: { name: string }[]): string {
  return players.map((player) => player.name).filter(Boolean).join(" y ");
}

function outcomeLabel(
  scoreA: number | undefined,
  scoreB: number | undefined,
  sideA: string,
  sideB: string
): string {
  if (!isAmericanoMatchScored({ scoreA, scoreB })) return "Sin marcador";
  if (scoreA === scoreB) return "Empate";
  return scoreA! > scoreB! ? `Ganan ${sideA}` : `Ganan ${sideB}`;
}

export const RoundHistory: React.FC<RoundHistoryProps> = ({
  rounds,
  totalRounds = 0,
  phase = "playing",
  playerFotos = {},
  onEditScore,
}) => {
  const [editing, setEditing] = useState<EditingMatch | null>(null);
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFinished, setConfirmFinished] = useState(false);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(() =>
    Math.max(rounds.length - 1, 0)
  );

  useEffect(() => {
    setSelectedRoundIndex((prev) =>
      Math.min(Math.max(prev, 0), Math.max(rounds.length - 1, 0))
    );
  }, [rounds.length]);

  const selectedRound = rounds[selectedRoundIndex] ?? null;

  const openEdit = (roundIndex: number, round: AmericanoRound, matchId: string) => {
    const match = round.matches.find((item) => item.id === matchId);
    if (!match) return;
    const toSide = (player: (typeof match.teamA)[number]): EditingSide => ({
      id: player.id,
      name: player.name,
      fotoUrl: playerFotos[player.id],
    });
    setEditing({
      roundIndex,
      roundNumber: round.roundNumber,
      matchId: match.id,
      court: match.court,
      sideA: [toSide(match.teamA[0]), toSide(match.teamA[1])],
      sideB: [toSide(match.teamB[0]), toSide(match.teamB[1])],
      scoreA: match.scoreA != null ? String(match.scoreA) : "",
      scoreB: match.scoreB != null ? String(match.scoreB) : "",
    });
    setDraftA(match.scoreA != null ? String(match.scoreA) : "");
    setDraftB(match.scoreB != null ? String(match.scoreB) : "");
    setFormError(null);
    setConfirmFinished(false);
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
    setFormError(null);
  };

  const saveEdit = async () => {
    if (!editing || !onEditScore || saving) return;
    const scoreA = parseAmericanoScore(draftA);
    const scoreB = parseAmericanoScore(draftB);
    if (scoreA == null || scoreB == null) {
      setFormError("Usa números enteros, finitos y no negativos.");
      return;
    }
    if (phase === "finished" && !confirmFinished) {
      setFormError("Confirma que quieres corregir un americano ya finalizado.");
      return;
    }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const result = await onEditScore(
        editing.roundIndex,
        editing.matchId,
        scoreA,
        scoreB
      );
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setNotice("Resultado corregido y ranking actualizado");
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  if (rounds.length === 0) {
    return (
      <section className="americano-history">
        <h3>Historial</h3>
        <p className="americano-history__empty">Aún no hay rondas jugadas.</p>
      </section>
    );
  }

  return (
    <section className="americano-history">
      <h3>Historial</h3>
      {onEditScore ? (
        <p className="americano-history__help">
          ¿Te equivocaste en un resultado? Toca el lápiz en el partido, corrige
          el marcador y guarda. El ranking se recalcula solo.
        </p>
      ) : null}
      {notice ? (
        <p className="americano-history__notice" role="status">
          {notice}
        </p>
      ) : null}

      <div
        className="americano-history__nav"
        role="tablist"
        aria-label="Rondas del historial"
      >
        {rounds.map((round, index) => (
          <button
            key={round.roundNumber}
            type="button"
            role="tab"
            aria-selected={index === selectedRoundIndex}
            className={
              index === selectedRoundIndex
                ? "americano-history__nav-btn is-active"
                : "americano-history__nav-btn"
            }
            onClick={() => setSelectedRoundIndex(index)}
          >
            R{round.roundNumber}
          </button>
        ))}
      </div>

      {selectedRound ? (
        <section
          className="americano-history__round"
          aria-label={`Ronda ${selectedRound.roundNumber}`}
        >
          <header className="americano-history__round-head">
            <h4>
              Ronda {selectedRound.roundNumber}
              {totalRounds > 0 ? (
                <span className="americano-history__of"> de {totalRounds}</span>
              ) : null}
            </h4>
            <span className="americano-history__phase">
              {americanoRoundPhaseCaption(selectedRound, totalRounds) ||
                "Americano"}
            </span>
          </header>
          <div className="americano-history__matches">
            {sortByMatchCourt(selectedRound.matches).map((match) => {
              const scored = isAmericanoMatchScored(match);
              const revision = match.scoreRevision;
              const namesA = pairNames(match.teamA);
              const namesB = pairNames(match.teamB);
              const result = outcomeLabel(
                match.scoreA,
                match.scoreB,
                namesA,
                namesB
              );
              const toLine = (players: typeof match.teamA) =>
                players.map((player) => ({
                  id: player.id,
                  name: player.name,
                  fotoUrl: playerFotos[player.id],
                }));
              return (
                <article key={match.id} className="americano-history__match">
                  <div className="americano-history__match-top">
                    <span className="americano-history__court">
                      {formatMatchCourtLabel(match.court)}
                    </span>
                    <span className="americano-history__outcome">{result}</span>
                    {revision ? (
                      <span
                        className="americano-history__edited"
                        tabIndex={0}
                        title={`Marcador anterior: ${revision.previousScoreA}–${revision.previousScoreB}`}
                      >
                        Editado
                        <span
                          className="americano-history__edited-tip"
                          role="tooltip"
                        >
                          Marcador anterior: {revision.previousScoreA}–
                          {revision.previousScoreB}
                        </span>
                      </span>
                    ) : null}
                    {onEditScore ? (
                      <button
                        type="button"
                        className="americano-history__edit"
                        aria-label={`Corregir ${formatMatchCourtLabel(match.court)}: ${namesA} contra ${namesB}`}
                        onClick={() =>
                          openEdit(selectedRoundIndex, selectedRound, match.id)
                        }
                      >
                        <TablerIcon name="pencil" size={14} />
                        Corregir
                      </button>
                    ) : null}
                  </div>
                  <AmericanoCourtBoard
                    sideA={toLine(match.teamA)}
                    sideB={toLine(match.teamB)}
                    labelA={namesA}
                    labelB={namesB}
                    scoreA={
                      <AmericanoPairMark
                        value={scored ? match.scoreA : null}
                        opponent={scored ? match.scoreB : null}
                      />
                    }
                    scoreB={
                      <AmericanoPairMark
                        value={scored ? match.scoreB : null}
                        opponent={scored ? match.scoreA : null}
                      />
                    }
                  />
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <Modal
        open={editing != null}
        onClose={closeEdit}
        title="Corregir marcador"
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeEdit} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveEdit} loading={saving} disabled={saving}>
              Guardar corrección
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="americano-history__form">
            <p className="americano-history__form-meta">
              Ronda {editing.roundNumber} · {formatMatchCourtLabel(editing.court)}
            </p>
            <AmericanoCourtBoard
              sideA={editing.sideA}
              sideB={editing.sideB}
              labelA={pairNames(editing.sideA)}
              labelB={pairNames(editing.sideB)}
              scoreA={
                <input
                  aria-label={`Marcador de ${pairNames(editing.sideA)}`}
                  inputMode="numeric"
                  value={draftA}
                  onChange={(event) => setDraftA(event.target.value)}
                  disabled={saving}
                />
              }
              scoreB={
                <input
                  aria-label={`Marcador de ${pairNames(editing.sideB)}`}
                  inputMode="numeric"
                  value={draftB}
                  onChange={(event) => setDraftB(event.target.value)}
                  disabled={saving}
                />
              }
            />
            {phase === "finished" ? (
              <label className="americano-history__confirm">
                <input
                  type="checkbox"
                  checked={confirmFinished}
                  onChange={(event) => setConfirmFinished(event.target.checked)}
                  disabled={saving}
                />
                Este americano ya finalizó. Confirmo corregir el resultado publicado.
              </label>
            ) : null}
            {formError ? (
              <p className="americano-history__form-error" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
