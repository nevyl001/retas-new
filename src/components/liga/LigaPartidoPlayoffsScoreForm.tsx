import React from "react";
import type { LigaPartido } from "../../lib/liga/types";
import {
  emptyPlayoffsScoreDraft,
  needsPlayoffsStbDraft,
  parsePlayoffsSetScoresJson,
  playoffsMatchDisplay,
  playoffsTotalsFromDraft,
  previewPlayoffsPointsFromDraft,
  type PlayoffsScoreDraft,
  type PlayoffsSetDraft,
} from "../../lib/liga/parejasFijasPlayoffsMatchScore";
import { Button } from "../ui";

type Props = {
  partido: LigaPartido;
  draft: PlayoffsScoreDraft;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: PlayoffsScoreDraft) => void;
  onSave: () => void;
};

function SetRow({
  label,
  draft,
  disabled,
  onChange,
}: {
  label: string;
  draft: PlayoffsSetDraft;
  disabled?: boolean;
  onChange: (next: PlayoffsSetDraft) => void;
}) {
  return (
    <div className="liga-score-row liga-playoffs-score__set">
      <span className="liga-playoffs-score__set-label">{label}</span>
      <label>
        P1
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={draft.p1}
          onChange={(e) => onChange({ ...draft, p1: e.target.value })}
          aria-label={`${label} pareja 1`}
        />
      </label>
      <span className="liga-playoffs-score__sep" aria-hidden>
        —
      </span>
      <label>
        P2
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={draft.p2}
          onChange={(e) => onChange({ ...draft, p2: e.target.value })}
          aria-label={`${label} pareja 2`}
        />
      </label>
    </div>
  );
}

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
  // WO no se captura en UI admin; si existiera en BD, se puede sobrescribir al corregir.
  return base;
}

export const LigaPartidoPlayoffsScoreForm: React.FC<Props> = ({
  partido,
  draft,
  disabled,
  busy,
  onChange,
  onSave,
}) => {
  const locked = Boolean(disabled || busy);
  const showStb = needsPlayoffsStbDraft(draft);
  const totals = playoffsTotalsFromDraft(draft);
  const preview = previewPlayoffsPointsFromDraft(draft);
  const isCompleted = partido.estado === "completed";

  const saved =
    isCompleted &&
    partido.score_pareja1 != null &&
    partido.score_pareja2 != null
      ? playoffsMatchDisplay(
          partido.score_pareja1,
          partido.score_pareja2,
          parsePlayoffsSetScoresJson(partido.set_scores)
        )
      : null;

  return (
    <div className="liga-playoffs-score">
      {saved ? (
        <p className="liga-hint">Resultado: {saved}</p>
      ) : null}
      <p className="liga-playoffs-score__rules">
        Clasificación por games totales (Set 1 + Set 2). No hace falta llegar a
        6. Diff {">"}2 → 3/0 · Diff 1–2 → 2/1 · Empate → STB a 5 (2/1).
      </p>
      <SetRow
        label="Set 1"
        draft={draft.set1}
        disabled={locked}
        onChange={(set1) => onChange({ ...draft, set1, woWinner: null })}
      />
      <SetRow
        label="Set 2"
        draft={draft.set2}
        disabled={locked}
        onChange={(set2) => onChange({ ...draft, set2, woWinner: null })}
      />
      {totals ? (
        <p className="liga-playoffs-score__totals" aria-live="polite">
          Games totales
          <span className="liga-playoffs-score__totals-values">
            P1 {totals.score1} — {totals.score2} P2
          </span>
        </p>
      ) : null}
      {preview.kind !== "incomplete" && preview.kind !== "wo" ? (
        <p
          className={`liga-playoffs-score__preview liga-playoffs-score__preview--${preview.kind}`}
          role="status"
        >
          <strong>{preview.title}</strong>
          <span>{preview.line}</span>
        </p>
      ) : null}
      {showStb ? (
        <>
          <p className="liga-playoffs-score__stb-hint" role="status">
            Súper Tie-Break a 5
          </p>
          <div className="liga-score-row liga-playoffs-score__stb">
            <label>
              P1
              <input
                type="number"
                min={0}
                disabled={locked}
                value={draft.stb1}
                onChange={(e) =>
                  onChange({ ...draft, stb1: e.target.value, woWinner: null })
                }
                aria-label="Súper tie-break pareja 1"
              />
            </label>
            <span className="liga-playoffs-score__sep" aria-hidden>
              —
            </span>
            <label>
              P2
              <input
                type="number"
                min={0}
                disabled={locked}
                value={draft.stb2}
                onChange={(e) =>
                  onChange({ ...draft, stb2: e.target.value, woWinner: null })
                }
                aria-label="Súper tie-break pareja 2"
              />
            </label>
          </div>
        </>
      ) : null}
      <div className="liga-actions" style={{ marginTop: 8 }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={locked}
          onClick={onSave}
        >
          {isCompleted ? "Corregir" : "Guardar"}
        </Button>
      </div>
      <p className="liga-hint">
        Al corregir se recalcula el ranking al momento. El resultado usa la suma
        de games, no sets ganados.
      </p>
    </div>
  );
};
