import React, { useMemo } from "react";
import {
  draftFromSetScores,
  needsSuperTiebreakDraft,
  normalizeParejasFijasDraft,
  validateParejasFijasDraft,
  type ParejasFijasSetsDraft,
  type SetScoreDraft,
} from "../../lib/liga/parejasFijasMatchScore";
import type { LigaPartido } from "../../lib/liga/types";
import { Button } from "../ui";
import { LigaScoreInput } from "./LigaScoreInput";

function SetInputRow({
  label,
  draft,
  onChange,
  disabled,
  compact,
  pareja1Label,
  pareja2Label,
}: {
  label: string;
  draft: SetScoreDraft;
  onChange: (next: SetScoreDraft) => void;
  disabled?: boolean;
  compact?: boolean;
  pareja1Label: string;
  pareja2Label: string;
}) {
  return (
    <div className={`liga-set-capture${compact ? " liga-set-capture--compact" : ""}`}>
      <div className="liga-set-capture__head">
        <span className="liga-set-capture__label">{label}</span>
      </div>
      <div className="liga-set-capture__inputs">
        <LigaScoreInput
          value={draft.p1}
          onChange={(p1) => onChange({ ...draft, p1 })}
          disabled={disabled}
          ariaLabel={`${label} games ${pareja1Label}`}
        />
        <span className="liga-set-capture__vs" aria-hidden>
          vs
        </span>
        <LigaScoreInput
          value={draft.p2}
          onChange={(p2) => onChange({ ...draft, p2 })}
          disabled={disabled}
          ariaLabel={`${label} games ${pareja2Label}`}
        />
      </div>
    </div>
  );
}

export function getSetsDraftForPartido(
  partido: LigaPartido,
  drafts: Record<string, ParejasFijasSetsDraft>
): ParejasFijasSetsDraft {
  const legacyScores =
    partido.set_scores &&
    typeof partido.set_scores === "object" &&
    "sets" in partido.set_scores
      ? (partido.set_scores as import("../../lib/liga/parejasFijasMatchScore").LigaPartidoSetScores)
      : null;
  const base = drafts[partido.id] ?? draftFromSetScores(legacyScores);
  return normalizeParejasFijasDraft(base);
}

interface LigaPartidoSetsScoreFormProps {
  partido: LigaPartido;
  draft: ParejasFijasSetsDraft;
  pareja1Label: string;
  pareja2Label: string;
  disabled?: boolean;
  busy?: boolean;
  justSaved?: boolean;
  compact?: boolean;
  onChange: (next: ParejasFijasSetsDraft) => void;
  onSave: () => void;
}

export const LigaPartidoSetsScoreForm: React.FC<LigaPartidoSetsScoreFormProps> = ({
  draft,
  pareja1Label,
  pareja2Label,
  disabled,
  busy,
  justSaved,
  compact = false,
  onChange,
  onSave,
}) => {
  const showSet3 = needsSuperTiebreakDraft(draft);
  const validationError = useMemo(() => validateParejasFijasDraft(draft), [draft]);
  const canSave = !validationError && !disabled && !busy;

  const handleDraftChange = (next: ParejasFijasSetsDraft) => {
    onChange(normalizeParejasFijasDraft(next));
  };

  return (
    <div className={`liga-sets-form liga-sets-form--capture${compact ? " liga-sets-form--compact" : ""}`}>
      <div className={compact ? "liga-sets-form__grid" : undefined}>
        <SetInputRow
          label="Set 1"
          pareja1Label={pareja1Label}
          pareja2Label={pareja2Label}
          draft={draft.set1}
          disabled={disabled || busy}
          compact={compact}
          onChange={(set1) => handleDraftChange({ ...draft, set1 })}
        />
        <SetInputRow
          label="Set 2"
          pareja1Label={pareja1Label}
          pareja2Label={pareja2Label}
          draft={draft.set2}
          disabled={disabled || busy}
          compact={compact}
          onChange={(set2) => handleDraftChange({ ...draft, set2 })}
        />
      </div>
      {showSet3 ? (
        <div className="liga-sets-form__set3 liga-sets-form__set3--visible">
          <SetInputRow
            label="Set 3 (súper tie-break)"
            pareja1Label={pareja1Label}
            pareja2Label={pareja2Label}
            draft={draft.set3}
            disabled={disabled || busy}
            compact={compact}
            onChange={(set3) => handleDraftChange({ ...draft, set3 })}
          />
        </div>
      ) : null}

      {validationError ? (
        <p className="liga-sets-form__error" role="alert">
          {validationError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="primary"
        className="liga-partido-save-btn"
        disabled={!canSave}
        onClick={onSave}
      >
        {justSaved ? "¡Guardado! ✅" : "Guardar resultado"}
      </Button>
    </div>
  );
};
