import React, { useMemo, useState } from "react";
import {
  canAddAnotherDueloSet,
  canRemoveLastDueloSet,
  detalleToDraftRows,
  dueloScoreHint,
  summarizeDraftRows,
  type SetRowDraft,
} from "../../lib/duelo2v2/scoring";
import type { Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import { Button } from "../ui";

function initialRows(detalle: Duelo2v2SetDetalle[]): SetRowDraft[] {
  if (detalle.length > 0) return detalleToDraftRows(detalle, 1);
  return [{ a: "", b: "" }];
}

function parseScoreDraft(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 2);
}

interface Duelo2v2ScoreEditorProps {
  teamAName: string;
  teamBName: string;
  initialDetalle: Duelo2v2SetDetalle[];
  disabled?: boolean;
  onSave: (detalle: Duelo2v2SetDetalle[]) => void | Promise<void>;
}

export const Duelo2v2ScoreEditor: React.FC<Duelo2v2ScoreEditorProps> = ({
  teamAName,
  teamBName,
  initialDetalle,
  disabled = false,
  onSave,
}) => {
  const [rows, setRows] = useState<SetRowDraft[]>(() => initialRows(initialDetalle));

  const summary = useMemo(() => summarizeDraftRows(rows), [rows]);
  const hint = useMemo(() => dueloScoreHint(summary), [summary]);
  const canAddSet = canAddAnotherDueloSet(rows);
  const canRemoveSet = canRemoveLastDueloSet(rows.length);

  const winnerLabel =
    summary.ganador === "a"
      ? teamAName
      : summary.ganador === "b"
        ? teamBName
        : null;

  const updateRow = (index: number, side: "a" | "b", raw: string) => {
    const sanitized = parseScoreDraft(raw);
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [side]: sanitized } : row))
    );
  };

  const addSet = () => {
    if (!canAddAnotherDueloSet(rows)) return;
    setRows((prev) => [...prev, { a: "", b: "" }]);
  };

  const removeLastSet = () => {
    if (!canRemoveLastDueloSet(rows.length)) return;
    setRows((prev) => prev.slice(0, -1));
  };

  return (
    <div className="duelo2v2-score-editor">
      <div className="duelo2v2-score-editor__inner">
        <div className="duelo2v2-score-editor__scoreboard">
          <div className="duelo2v2-score-editor__side duelo2v2-score-editor__side--a">
            <span className="duelo2v2-score-editor__side-name">{teamAName}</span>
            <span className="duelo2v2-score-editor__side-sets">{summary.setsWonA}</span>
          </div>
          <div className="duelo2v2-score-editor__mid">
            <span className="duelo2v2-score-editor__mid-label">Sets ganados</span>
          </div>
          <div className="duelo2v2-score-editor__side duelo2v2-score-editor__side--b">
            <span className="duelo2v2-score-editor__side-name">{teamBName}</span>
            <span className="duelo2v2-score-editor__side-sets">{summary.setsWonB}</span>
          </div>
        </div>

        <div className="duelo2v2-score-editor__sets">
          <div className="duelo2v2-score-editor__sets-head">
            <span className="duelo2v2-score-editor__sets-head-cell" aria-hidden />
            <span className="duelo2v2-score-editor__sets-head-cell duelo2v2-score-editor__sets-head-cell--a">
              {teamAName}
            </span>
            <span className="duelo2v2-score-editor__sets-head-cell" aria-hidden />
            <span className="duelo2v2-score-editor__sets-head-cell duelo2v2-score-editor__sets-head-cell--b">
              {teamBName}
            </span>
          </div>

          {rows.map((row, index) => {
            const outcome = summary.setOutcomes[index] ?? "incompleto";

            return (
              <div
                key={index}
                className={`duelo2v2-score-editor__set-row duelo2v2-score-editor__set-row--${outcome}`}
              >
                <span className="duelo2v2-score-editor__set-label">Set {index + 1}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="duelo2v2-score-editor__input"
                  value={row.a}
                  disabled={disabled}
                  placeholder="0"
                  aria-label={`Set ${index + 1} juegos ${teamAName}`}
                  onChange={(e) => updateRow(index, "a", e.target.value)}
                />
                <span className="duelo2v2-score-editor__divider">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="duelo2v2-score-editor__input"
                  value={row.b}
                  disabled={disabled}
                  placeholder="0"
                  aria-label={`Set ${index + 1} juegos ${teamBName}`}
                  onChange={(e) => updateRow(index, "b", e.target.value)}
                />
              </div>
            );
          })}
        </div>

        {!disabled && (
          <div className="duelo2v2-score-editor__toolbar">
            {canAddSet ? (
              <Button type="button" variant="ghost" size="sm" onClick={addSet}>
                + Agregar set
              </Button>
            ) : (
              <span />
            )}
            {canRemoveSet ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeLastSet}
              >
                ✕ Quitar último
              </Button>
            ) : null}
          </div>
        )}

        {winnerLabel ? (
          <p className="duelo2v2-score-editor__hint duelo2v2-score-editor__hint--ok">
            Ganador detectado:{" "}
            <strong>
              {winnerLabel} (
              {summary.ganador === "a"
                ? `${summary.setsWonA}–${summary.setsWonB}`
                : `${summary.setsWonB}–${summary.setsWonA}`}
              )
            </strong>
          </p>
        ) : (
          <p className="duelo2v2-score-editor__hint">{hint}</p>
        )}

        {!disabled && (
          <div className="duelo2v2-score-editor__save">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onSave(summary.detalle)}
            >
              Guardar marcador
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
