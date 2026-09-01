import React from "react";
import type { LigaPartido } from "../../lib/liga/types";
import {
  emptyPlayoffsScoreDraft,
  needsPlayoffsStbDraft,
  parsePlayoffsSetScoresJson,
  type PlayoffsScoreDraft,
} from "../../lib/liga/parejasFijasPlayoffsMatchScore";
import { Button } from "../ui";
import { LigaScoreInput } from "./LigaScoreInput";

type Props = {
  partido: LigaPartido;
  draft: PlayoffsScoreDraft;
  pareja1Label: string;
  pareja2Label: string;
  disabled?: boolean;
  busy?: boolean;
  justSaved?: boolean;
  compact?: boolean;
  onChange: (next: PlayoffsScoreDraft) => void;
  onSave: () => void;
};

export function getPlayoffsDraftForPartido(
  partido: LigaPartido,
  drafts: Record<string, PlayoffsScoreDraft>
): PlayoffsScoreDraft {
  if (drafts[partido.id]) return drafts[partido.id]!;
  const payload = parsePlayoffsSetScoresJson(partido.set_scores);
  if (partido.score_pareja1 == null || partido.score_pareja2 == null) {
    return emptyPlayoffsScoreDraft();
  }

  const base = emptyPlayoffsScoreDraft();
  if (payload?.sets && payload.sets.length === 2) {
    base.set1 = {
      p1: String(payload.sets[0].p1),
      p2: String(payload.sets[0].p2),
    };
    base.set2 = {
      p1: String(payload.sets[1].p1),
      p2: String(payload.sets[1].p2),
    };
  }
  if (payload?.stb) {
    base.stb1 = String(payload.stb.p1);
    base.stb2 = String(payload.stb.p2);
  }
  return base;
}

function PlayoffsSetRow({
  label,
  p1,
  p2,
  disabled,
  compact,
  onChangeP1,
  onChangeP2,
  ariaLeft,
  ariaRight,
  partidoId,
  fieldKey,
}: {
  label: string;
  p1: string;
  p2: string;
  disabled?: boolean;
  compact?: boolean;
  onChangeP1: (v: string) => void;
  onChangeP2: (v: string) => void;
  ariaLeft: string;
  ariaRight: string;
  partidoId: string;
  fieldKey: string;
}) {
  return (
    <div className={`liga-set-capture${compact ? " liga-set-capture--compact" : ""}`}>
      <div className="liga-set-capture__head">
        <span className="liga-set-capture__label">{label}</span>
      </div>
      <div className="liga-set-capture__inputs">
        <LigaScoreInput
          id={`liga-partido-${partidoId}-${fieldKey}-p1`}
          value={p1}
          onChange={onChangeP1}
          disabled={disabled}
          ariaLabel={ariaLeft}
        />
        <span className="liga-set-capture__vs" aria-hidden>
          vs
        </span>
        <LigaScoreInput
          id={`liga-partido-${partidoId}-${fieldKey}-p2`}
          value={p2}
          onChange={onChangeP2}
          disabled={disabled}
          ariaLabel={ariaRight}
        />
      </div>
    </div>
  );
}

export const LigaPartidoPlayoffsScoreForm: React.FC<Props> = ({
  partido,
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
  const locked = Boolean(disabled || busy);
  const showStb = needsPlayoffsStbDraft(draft);
  const left = pareja1Label.trim() || "Pareja 1";
  const right = pareja2Label.trim() || "Pareja 2";

  return (
    <div className={`liga-playoffs-score liga-playoffs-score--capture${compact ? " liga-playoffs-score--compact" : ""}`}>
      <div className={compact ? "liga-sets-form__grid" : undefined}>
        <PlayoffsSetRow
          label="Set 1"
          partidoId={partido.id}
          fieldKey="playoffs-set1"
          p1={draft.set1.p1}
          p2={draft.set1.p2}
          disabled={locked}
          compact={compact}
          ariaLeft={`Set 1: games de ${left}`}
          ariaRight={`Set 1: games de ${right}`}
          onChangeP1={(p1) =>
            onChange({ ...draft, set1: { ...draft.set1, p1 }, woWinner: null })
          }
          onChangeP2={(p2) =>
            onChange({ ...draft, set1: { ...draft.set1, p2 }, woWinner: null })
          }
        />
        <PlayoffsSetRow
          label="Set 2"
          partidoId={partido.id}
          fieldKey="playoffs-set2"
          p1={draft.set2.p1}
          p2={draft.set2.p2}
          disabled={locked}
          compact={compact}
          ariaLeft={`Set 2: games de ${left}`}
          ariaRight={`Set 2: games de ${right}`}
          onChangeP1={(p1) =>
            onChange({ ...draft, set2: { ...draft.set2, p1 }, woWinner: null })
          }
          onChangeP2={(p2) =>
            onChange({ ...draft, set2: { ...draft.set2, p2 }, woWinner: null })
          }
        />
      </div>

      {showStb ? (
        <div className="liga-sets-form__set3 liga-sets-form__set3--visible">
          <PlayoffsSetRow
            label="Súper tie-break (a 5)"
            partidoId={partido.id}
            fieldKey="playoffs-stb"
            p1={draft.stb1}
            p2={draft.stb2}
            disabled={locked}
            compact={compact}
            ariaLeft={`Súper tie-break: ${left}`}
            ariaRight={`Súper tie-break: ${right}`}
            onChangeP1={(stb1) => onChange({ ...draft, stb1, woWinner: null })}
            onChangeP2={(stb2) => onChange({ ...draft, stb2, woWinner: null })}
          />
        </div>
      ) : null}

      <Button
        type="button"
        variant="primary"
        className="liga-partido-save-btn"
        disabled={locked}
        onClick={onSave}
      >
        {justSaved ? "¡Guardado! ✅" : "Guardar resultado"}
      </Button>
    </div>
  );
};
