import React, { useEffect, useMemo, useState } from "react";
import {
  buildPersistPayload,
  canAddAnotherSet,
  canAddSuperMuerte,
  canRemoveLastSet,
  countSetWins,
  detectMatchWinner,
  emptySetDraft,
  emptySuperMuerteDraft,
  formatSetWinsForWinner,
  getPartidoSets,
  getSetsValidationMessage,
} from "../../lib/torneoExpress/partidoSets";
import type {
  ExpectedPairs,
  PartidoSetScore,
  TorneoExpressPartidoFormato,
} from "../../lib/torneoExpress/types";
import { TorneoExpressComposicionCambiadaError } from "../../services/torneoExpressService";
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
  /** Ids congelados por quien abre el modal. La eliminatoria no los usa. */
  expectedPairs?: ExpectedPairs | null;
  /** Formato del evento; afecta validación del 3er set. */
  partidoFormato?: TorneoExpressPartidoFormato;
  /** En eliminatoria no se permiten empates a un set. */
  allowDraw?: boolean;
  saving?: boolean;
  onSave: (
    sets: PartidoSetScore[],
    expectedPairs: ExpectedPairs | null
  ) => Promise<void>;
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
  expectedPairs = null,
  partidoFormato = "flexible",
  allowDraw = true,
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
  const [frozenExpected, setFrozenExpected] = useState<ExpectedPairs | null>(
    expectedPairs
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
      // El snapshot es el de esta apertura. Un realtime posterior no lo pisa.
      setFrozenExpected(expectedPairs);
    }
    // expectedPairs se lee solo cuando `open` cambia, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validationOpts = useMemo(
    () => ({ allowDraw, partidoFormato }),
    [allowDraw, partidoFormato]
  );
  const winner = useMemo(() => detectMatchWinner(sets), [sets]);
  const wins = useMemo(() => countSetWins(sets), [sets]);
  const validationMessage = useMemo(
    () => getSetsValidationMessage(sets, validationOpts),
    [sets, validationOpts]
  );
  const isDraw =
    sets.length === 1 &&
    sets[0].local === sets[0].visitante &&
    validationMessage === null;
  const canSave = useMemo(
    () =>
      buildPersistPayload(sets, validationOpts) !== null &&
      validationMessage === null,
    [sets, validationOpts, validationMessage]
  );
  const showSuperMuerteHint = partidoFormato === "bo3_super_muerte";

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

  const addSuperMuerte = () => {
    if (!canAddSuperMuerte(sets)) return;
    setSets((prev) => [...prev, emptySuperMuerteDraft()]);
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

  const winsForDisplay =
    winner && winnerLabel
      ? formatSetWinsForWinner(winner, wins)
      : null;

  const isSingleSetMode = sets.length === 1;

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
            onClick={() => {
              void onSave(sets, frozenExpected)
                .then(onClose)
                .catch((err: unknown) => {
                  if (err instanceof TorneoExpressComposicionCambiadaError) {
                    onClose();
                    return;
                  }
                  const msg =
                    err instanceof Error
                      ? err.message
                      : "No se pudo guardar el resultado";
                  window.alert(msg);
                });
            }}
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

        {showSuperMuerteHint ? (
          <p className="te-sets-modal__format-hint" role="note">
            Formato del evento: mejor de 3. Si van 1–1, captura el Set 3 como
            set normal o con «+ Súper muerte»; tú decides.
          </p>
        ) : null}

        <div className="te-sets-modal__rows">
          {sets.map((set, index) => (
            <div key={index} className="te-sets-modal__row">
              <span className="te-sets-modal__row-label">
                {set.super_muerte ? "Súper muerte" : `Set ${index + 1}`}
              </span>
              <div className="te-sets-modal__row-inputs">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="te-sets-modal__input"
                  value={drafts[index * 2] ?? ""}
                  disabled={saving}
                  aria-label={`${set.super_muerte ? "Súper muerte" : `Set ${index + 1}`} ${localLabel}`}
                  onFocus={(e) => e.currentTarget.select()}
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
                  aria-label={`${set.super_muerte ? "Súper muerte" : `Set ${index + 1}`} ${visitLabel}`}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    updateSet(index, "visitante", e.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="te-sets-modal__toolbar">
          <div className="te-sets-modal__toolbar-add">
            {canAddAnotherSet(sets) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={addSet}
              >
                + Añadir set
              </Button>
            ) : null}
            {canAddSuperMuerte(sets) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={addSuperMuerte}
              >
                + Súper muerte
              </Button>
            ) : null}
          </div>
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
              ✓ {winnerLabel}
              {isSingleSetMode
                ? ""
                : ` (${winsForDisplay?.winnerSets ?? 0} sets a ${
                    winsForDisplay?.loserSets ?? 0
                  })`}
            </strong>
          </p>
        ) : isDraw ? (
          <p className="te-sets-modal__winner" role="status">
            Empate detectado: mismo número de games. Se guardará como empate.
          </p>
        ) : validationMessage ? (
          <p className="te-sets-modal__hint" role="status">
            {validationMessage}
          </p>
        ) : (
          <p className="te-sets-modal__hint">
            Cualquier marcador vale (a 6, a 8 o por tiempo). Gana quien tenga
            más games. Un set = partido; añade otro para mejor de 3.
          </p>
        )}
      </div>
    </Modal>
  );
};
