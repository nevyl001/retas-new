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
  /** Nombre visible de la pareja local (izquierda / games p1). */
  pareja1Label: string;
  /** Nombre visible de la pareja visitante (derecha / games p2). */
  pareja2Label: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: PlayoffsScoreDraft) => void;
  onSave: () => void;
};

function shortPairLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 26)}…`;
}

function ScoreColumnInputs({
  setLabel,
  draft,
  pareja1Label,
  pareja2Label,
  disabled,
  onChange,
}: {
  setLabel: string;
  draft: PlayoffsSetDraft;
  pareja1Label: string;
  pareja2Label: string;
  disabled?: boolean;
  onChange: (next: PlayoffsSetDraft) => void;
}) {
  return (
    <div className="liga-playoffs-score__set-block">
      <p className="liga-playoffs-score__set-title">{setLabel}</p>
      <div className="liga-playoffs-score__pair-grid">
        <label className="liga-playoffs-score__pair-field">
          <span className="liga-playoffs-score__pair-name" title={pareja1Label}>
            {shortPairLabel(pareja1Label)}
          </span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={draft.p1}
            onChange={(e) => onChange({ ...draft, p1: e.target.value })}
            aria-label={`${setLabel}: games de ${pareja1Label}`}
          />
        </label>
        <span className="liga-playoffs-score__vs" aria-hidden>
          vs
        </span>
        <label className="liga-playoffs-score__pair-field">
          <span className="liga-playoffs-score__pair-name" title={pareja2Label}>
            {shortPairLabel(pareja2Label)}
          </span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={draft.p2}
            onChange={(e) => onChange({ ...draft, p2: e.target.value })}
            aria-label={`${setLabel}: games de ${pareja2Label}`}
          />
        </label>
      </div>
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
  return base;
}

export const LigaPartidoPlayoffsScoreForm: React.FC<Props> = ({
  partido,
  draft,
  pareja1Label,
  pareja2Label,
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
  const left = pareja1Label.trim() || "Pareja 1";
  const right = pareja2Label.trim() || "Pareja 2";

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
        <p className="liga-hint">Resultado guardado: {saved}</p>
      ) : null}
      <p className="liga-playoffs-score__rules">
        Anota los games de cada pareja por set. La clasificación usa la suma
        total (Diff {">"}2 → 3/0 · Diff 1–2 → 2/1 · Empate → STB a 5).
      </p>

      <div className="liga-playoffs-score__matchup" aria-hidden>
        <span title={left}>{shortPairLabel(left)}</span>
        <span className="liga-playoffs-score__matchup-vs">vs</span>
        <span title={right}>{shortPairLabel(right)}</span>
      </div>

      <ScoreColumnInputs
        setLabel="Set 1"
        draft={draft.set1}
        pareja1Label={left}
        pareja2Label={right}
        disabled={locked}
        onChange={(set1) => onChange({ ...draft, set1, woWinner: null })}
      />
      <ScoreColumnInputs
        setLabel="Set 2"
        draft={draft.set2}
        pareja1Label={left}
        pareja2Label={right}
        disabled={locked}
        onChange={(set2) => onChange({ ...draft, set2, woWinner: null })}
      />

      {totals ? (
        <div className="liga-playoffs-score__totals-board" aria-live="polite">
          <p className="liga-playoffs-score__totals-title">Games totales</p>
          <div className="liga-playoffs-score__pair-grid">
            <div className="liga-playoffs-score__pair-field liga-playoffs-score__pair-field--readonly">
              <span className="liga-playoffs-score__pair-name" title={left}>
                {shortPairLabel(left)}
              </span>
              <strong>{totals.score1}</strong>
            </div>
            <span className="liga-playoffs-score__vs" aria-hidden>
              —
            </span>
            <div className="liga-playoffs-score__pair-field liga-playoffs-score__pair-field--readonly">
              <span className="liga-playoffs-score__pair-name" title={right}>
                {shortPairLabel(right)}
              </span>
              <strong>{totals.score2}</strong>
            </div>
          </div>
        </div>
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
        <div className="liga-playoffs-score__set-block liga-playoffs-score__set-block--stb">
          <p className="liga-playoffs-score__set-title">
            Súper Tie-Break a 5
          </p>
          <p className="liga-playoffs-score__stb-hint" role="status">
            Empate en games: registra quién gana el STB.
          </p>
          <div className="liga-playoffs-score__pair-grid">
            <label className="liga-playoffs-score__pair-field">
              <span className="liga-playoffs-score__pair-name" title={left}>
                {shortPairLabel(left)}
              </span>
              <input
                type="number"
                min={0}
                disabled={locked}
                value={draft.stb1}
                onChange={(e) =>
                  onChange({ ...draft, stb1: e.target.value, woWinner: null })
                }
                aria-label={`Súper tie-break: ${left}`}
              />
            </label>
            <span className="liga-playoffs-score__vs" aria-hidden>
              vs
            </span>
            <label className="liga-playoffs-score__pair-field">
              <span className="liga-playoffs-score__pair-name" title={right}>
                {shortPairLabel(right)}
              </span>
              <input
                type="number"
                min={0}
                disabled={locked}
                value={draft.stb2}
                onChange={(e) =>
                  onChange({ ...draft, stb2: e.target.value, woWinner: null })
                }
                aria-label={`Súper tie-break: ${right}`}
              />
            </label>
          </div>
        </div>
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
        Al guardar o corregir se actualiza el ranking al momento.
      </p>
    </div>
  );
};
