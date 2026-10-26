import React, { useState } from "react";
import type { AmericanoRound } from "../../lib/db/types";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import { formatMatchCourtLabel, sortByMatchCourt } from "../../lib/matchCourt";
import {
  parseAmericanoScore,
  type AmericanoEditScoreResult,
} from "../../lib/americanoScoreEdit";
import { isAmericanoMatchScored } from "../../lib/americanoPlayerJourney";
import { AmericanoPairLine } from "../americano/AmericanoPairLine";
import { Button, Input, Modal } from "../ui";
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

interface EditingMatch {
  roundIndex: number;
  roundNumber: number;
  matchId: string;
  court: number;
  teamA: string;
  teamB: string;
  scoreA: string;
  scoreB: string;
}

function outcomeLabel(scoreA?: number, scoreB?: number): string {
  if (!isAmericanoMatchScored({ scoreA, scoreB })) return "Sin marcador";
  if (scoreA === scoreB) return "Empate";
  return scoreA! > scoreB! ? "Gana pareja A" : "Gana pareja B";
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

  const openEdit = (roundIndex: number, round: AmericanoRound, matchId: string) => {
    const match = round.matches.find((item) => item.id === matchId);
    if (!match) return;
    setEditing({
      roundIndex,
      roundNumber: round.roundNumber,
      matchId: match.id,
      court: match.court,
      teamA: `${match.teamA[0].name} / ${match.teamA[1].name}`,
      teamB: `${match.teamB[0].name} / ${match.teamB[1].name}`,
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

      {rounds.map((round, roundIndex) => (
        <section
          key={round.roundNumber}
          className="americano-history__round"
          aria-label={`Ronda ${round.roundNumber}`}
        >
          <header className="americano-history__round-head">
            <h4>
              Ronda {round.roundNumber}
              {totalRounds > 0 ? (
                <span className="americano-history__of"> de {totalRounds}</span>
              ) : null}
            </h4>
            <span className="americano-history__phase">
              {americanoRoundPhaseCaption(round, totalRounds) || "Americano"}
            </span>
          </header>
          <div className="americano-history__matches">
            {sortByMatchCourt(round.matches).map((match) => {
              const scored = isAmericanoMatchScored(match);
              const aWins = scored && (match.scoreA as number) > (match.scoreB as number);
              const bWins = scored && (match.scoreB as number) > (match.scoreA as number);
              const tie = scored && match.scoreA === match.scoreB;
              const revision = match.scoreRevision;
              return (
                <article key={match.id} className="americano-history__match">
                  <div className="americano-history__match-top">
                    <span className="americano-history__court">
                      {formatMatchCourtLabel(match.court)}
                    </span>
                    <span className="americano-history__outcome">
                      {outcomeLabel(match.scoreA, match.scoreB)}
                    </span>
                    <span className="americano-history__capture">
                      {scored ? "Capturado" : "Pendiente"}
                    </span>
                    {revision ? (
                      <span
                        className="americano-history__edited"
                        tabIndex={0}
                        title={`Marcador anterior: ${revision.previousScoreA}–${revision.previousScoreB}`}
                      >
                        Editado
                        <span className="americano-history__edited-tip" role="tooltip">
                          Marcador anterior: {revision.previousScoreA}–
                          {revision.previousScoreB}
                        </span>
                      </span>
                    ) : null}
                    {onEditScore ? (
                      <button
                        type="button"
                        className="americano-history__edit"
                        aria-label={`Corregir ${formatMatchCourtLabel(match.court)}, ronda ${round.roundNumber}`}
                        onClick={() => openEdit(roundIndex, round, match.id)}
                      >
                        <TablerIcon name="pencil" size={14} />
                        Corregir
                      </button>
                    ) : null}
                  </div>
                  <div className="am-match-lineup">
                    <AmericanoPairLine
                      label="Pareja A"
                      highlight={aWins ? "win" : tie ? "tie" : scored ? "loss" : undefined}
                      players={match.teamA.map((player) => ({
                        id: player.id,
                        name: player.name,
                        fotoUrl: playerFotos[player.id],
                      }))}
                    />
                    <div className="am-match-lineup__score" aria-label={outcomeLabel(match.scoreA, match.scoreB)}>
                      {scored ? (
                        <>
                          <span>{match.scoreA}</span>
                          <span aria-hidden>–</span>
                          <span>{match.scoreB}</span>
                        </>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                    <AmericanoPairLine
                      label="Pareja B"
                      highlight={bWins ? "win" : tie ? "tie" : scored ? "loss" : undefined}
                      players={match.teamB.map((player) => ({
                        id: player.id,
                        name: player.name,
                        fotoUrl: playerFotos[player.id],
                      }))}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <Modal
        open={editing != null}
        onClose={closeEdit}
        title="Corregir marcador"
        size="sm"
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
            <p className="americano-history__form-teams">
              <span>{editing.teamA}</span>
              <span aria-hidden>vs</span>
              <span>{editing.teamB}</span>
            </p>
            <div className="americano-history__form-scores">
              <Input
                label="Pareja A"
                inputMode="numeric"
                value={draftA}
                onChange={(event) => setDraftA(event.target.value)}
                disabled={saving}
              />
              <Input
                label="Pareja B"
                inputMode="numeric"
                value={draftB}
                onChange={(event) => setDraftB(event.target.value)}
                disabled={saving}
              />
            </div>
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
