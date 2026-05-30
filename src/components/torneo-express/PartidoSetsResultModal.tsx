import React, { useEffect, useMemo, useState } from "react";
import {
  buildPersistPayload,
  canAddAnotherSet,
  canRemoveLastSet,
  countSetWins,
  detectMatchWinner,
  emptySetDraft,
  getPartidoSets,
} from "../../lib/torneoExpress/partidoSets";
import type { PartidoSetScore } from "../../lib/torneoExpress/types";
import { Button } from "../ui";
import { Modal } from "../ui/Modal";
import "./torneo-express.css";

export interface PartidoSetsResultModalProps {
  open: boolean;
  onClose: () => void;
  localLabel: string;
  visitLabel: string;
  initialPartido: {
    sets_resultado?: unknown;
    puntos_local?: number | null;
    puntos_visitante?: number | null;
    estado?: string;
  };
  saving?: boolean;
  onSave: (sets: PartidoSetScore[]) => Promise<void>;
}

function cloneSets(sets: PartidoSetScore[]): PartidoSetScore[] {
  return sets.map((s) => ({ ...s }));
}

function scoreDraftValue(n: number): string {
  return String(n);
}

function parseScoreDraft(raw: string): number {
  if (raw.trim() === "") return 0;
  return Math.max(0, Math.floor(Number(raw) || 0));
}

export const PartidoSetsResultModal: React.FC<PartidoSetsResultModalProps> = ({
  open,
  onClose,
  localLabel,
  visitLabel,
  initialPartido,
  saving = false,
  onSave,
}) => {
  const [sets, setSets] = useState<PartidoSetScore[]>(() =>
    cloneSets(getPartidoSets(initialPartido))
  );
  const [drafts, setDrafts] = useState<string[]>(() =>
    cloneSets(getPartidoSets(initialPartido)).flatMap((s) => [
      scoreDraftValue(s.local),
      scoreDraftValue(s.visitante),
    ])
  );

  useEffect(() => {
    if (open) {
      const next = cloneSets(getPartidoSets(initialPartido));
      setSets(next);
      setDrafts(
        next.flatMap((s) => [
          scoreDraftValue(s.local),
          scoreDraftValue(s.visitante),
        ])
      );
    }
  }, [open, initialPartido]);

  const winner = useMemo(() => detectMatchWinner(sets), [sets]);
  const wins = useMemo(() => countSetWins(sets), [sets]);
  const canSave = useMemo(() => buildPersistPayload(sets) !== null, [sets]);

  const updateSet = (
    index: number,
    side: "local" | "visitante",
    raw: string
  ) => {
    const sanitized = raw.replace(/\D/g, "").slice(0, 2);
    const draftIndex = index * 2 + (side === "local" ? 0 : 1);
    setDrafts((prev) => {
      const next = [...prev];
      next[draftIndex] = sanitized;
      return next;
    });
    const n = parseScoreDraft(sanitized);
    setSets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [side]: n } : s))
    );
  };

  const addSet = () => {
    if (!canAddAnotherSet(sets)) return;
    setSets((prev) => [...prev, emptySetDraft()]);
    setDrafts((prev) => [...prev, "", ""]);
  };

  const removeLastSet = () => {
    if (!canRemoveLastSet(sets)) return;
    setSets((prev) => prev.slice(0, -1));
    setDrafts((prev) => prev.slice(0, -2));
  };

  const winnerLabel =
    winner === "local"
      ? localLabel
      : winner === "visitante"
        ? visitLabel
        : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resultado del partido"
      size="md"
      footer={
        <div className="te-sets-modal__footer">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!canSave || saving}
            onClick={() => void onSave(sets).then(onClose)}
          >
            Guardar resultado
          </Button>
        </div>
      }
    >
      <div className="te-sets-modal">
        <div className="te-sets-modal__teams">
          <span className="te-sets-modal__team te-sets-modal__team--local">
            {localLabel}
          </span>
          <span className="te-sets-modal__team te-sets-modal__team--visit">
            {visitLabel}
          </span>
        </div>

        <div className="te-sets-modal__rows">
          {sets.map((set, index) => (
            <div key={index} className="te-sets-modal__row">
              <span className="te-sets-modal__row-label">Set {index + 1}</span>
              <div className="te-sets-modal__row-inputs">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="te-sets-modal__input"
                  value={drafts[index * 2] ?? ""}
                  disabled={saving}
                  aria-label={`Set ${index + 1} ${localLabel}`}
                  onChange={(e) => updateSet(index, "local", e.target.value)}
                />
                <span className="te-sets-modal__vs">vs</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="te-sets-modal__input"
                  value={drafts[index * 2 + 1] ?? ""}
                  disabled={saving}
                  aria-label={`Set ${index + 1} ${visitLabel}`}
                  onChange={(e) =>
                    updateSet(index, "visitante", e.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="te-sets-modal__toolbar">
          {canAddAnotherSet(sets) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={addSet}
            >
              + Agregar set
            </Button>
          ) : (
            <span />
          )}
          {canRemoveLastSet(sets) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={removeLastSet}
            >
              ✕ Quitar último
            </Button>
          ) : null}
        </div>

        {winnerLabel ? (
          <p className="te-sets-modal__winner">
            Ganador detectado automáticamente:{" "}
            <strong>
              ✓ {winnerLabel} ({wins.local} sets a {wins.visitante})
            </strong>
          </p>
        ) : (
          <p className="te-sets-modal__hint">
            Ingresa los marcadores de cada set. El ganador se detecta al llegar
            a 2 sets ganados.
          </p>
        )}
      </div>
    </Modal>
  );
};
