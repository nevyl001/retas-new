import React from "react";
import {
  draftFromSetScores,
  needsSuperTiebreakDraft,
  type ParejasFijasSetsDraft,
  type SetScoreDraft,
} from "../../lib/liga/parejasFijasMatchScore";
import type { LigaPartido } from "../../lib/liga/types";
import { Button } from "../ui";

function SetInputs({
  label,
  draft,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  draft: SetScoreDraft;
  onChange: (next: SetScoreDraft) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="liga-sets-row">
      <span className="liga-sets-row__label">
        {label}
        {hint ? <span className="liga-sets-row__hint">{hint}</span> : null}
      </span>
      <input
        type="number"
        min={0}
        className="liga-score-input"
        value={draft.p1}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, p1: e.target.value })}
        aria-label={`${label} pareja 1`}
      />
      <span>—</span>
      <input
        type="number"
        min={0}
        className="liga-score-input"
        value={draft.p2}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, p2: e.target.value })}
        aria-label={`${label} pareja 2`}
      />
    </div>
  );
}

export function getSetsDraftForPartido(
  partido: LigaPartido,
  drafts: Record<string, ParejasFijasSetsDraft>
): ParejasFijasSetsDraft {
  return drafts[partido.id] ?? draftFromSetScores(partido.set_scores);
}

interface LigaPartidoSetsScoreFormProps {
  partido: LigaPartido;
  draft: ParejasFijasSetsDraft;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: ParejasFijasSetsDraft) => void;
  onSave: () => void;
}

export const LigaPartidoSetsScoreForm: React.FC<LigaPartidoSetsScoreFormProps> = ({
  partido,
  draft,
  disabled,
  busy,
  onChange,
  onSave,
}) => {
  const showSet3 = needsSuperTiebreakDraft(draft);

  return (
    <div className="liga-sets-form">
      <p className="liga-sets-form__rules">
        Al mejor de 3 sets · sets 1-2 con punto de oro · set 3 super tie-break a 10
      </p>
      <SetInputs
        label="Set 1"
        draft={draft.set1}
        disabled={disabled || busy}
        onChange={(set1) => onChange({ ...draft, set1 })}
      />
      <SetInputs
        label="Set 2"
        draft={draft.set2}
        disabled={disabled || busy}
        onChange={(set2) => onChange({ ...draft, set2 })}
      />
      {showSet3 ? (
        <SetInputs
          label="Set 3"
          hint="STB a 10"
          draft={draft.set3}
          disabled={disabled || busy}
          onChange={(set3) => onChange({ ...draft, set3 })}
        />
      ) : null}
      <div className="liga-sets-form__actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || busy}
          onClick={onSave}
        >
          Guardar
        </Button>
        {partido.estado === "completed" && (
          <span className="liga-badge liga-badge--done">✓</span>
        )}
      </div>
    </div>
  );
};
