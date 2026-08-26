import React from "react";
import type { LigaPartido } from "../../lib/liga/types";
import {
  emptyPlayoffsScoreDraft,
  needsPlayoffsStbDraft,
  parsePlayoffsSetScoresJson,
  playoffsMatchDisplay,
  playoffsTotalsFromDraft,
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
  if (payload?.wo) {
    base.woWinner =
      partido.score_pareja1 > partido.score_pareja2 ? 1 : 2;
  }
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
  const locked = disabled || busy || draft.woWinner != null;
  const showStb = needsPlayoffsStbDraft(draft);
  const totals = playoffsTotalsFromDraft(draft);

  const saved =
    partido.estado === "completed" &&
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
        2 sets a 6 · Diff ≥2 → 3/0 · Diff 1 → 2/1 · Empate → STB a 5 (2/1)
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
        <p className="liga-playoffs-score__totals">
          Games totales: {totals.score1}–{totals.score2}
        </p>
      ) : null}
      {showStb ? (
        <>
          <p className="liga-playoffs-score__stb-hint" role="status">
            Empate en games: registra el súper tie-break a 5.
          </p>
          <div className="liga-score-row">
            <label>
              STB P1
              <input
                type="number"
                min={0}
                disabled={disabled || busy}
                value={draft.stb1}
                onChange={(e) =>
                  onChange({ ...draft, stb1: e.target.value })
                }
              />
            </label>
            <label>
              STB P2
              <input
                type="number"
                min={0}
                disabled={disabled || busy}
                value={draft.stb2}
                onChange={(e) =>
                  onChange({ ...draft, stb2: e.target.value })
                }
              />
            </label>
          </div>
        </>
      ) : null}
      <div className="liga-actions" style={{ marginTop: 8 }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          onClick={() =>
            onChange({
              ...emptyPlayoffsScoreDraft(),
              woWinner: draft.woWinner === 1 ? null : 1,
            })
          }
        >
          {draft.woWinner === 1 ? "Quitar WO P1" : "WO P1"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          onClick={() =>
            onChange({
              ...emptyPlayoffsScoreDraft(),
              woWinner: draft.woWinner === 2 ? null : 2,
            })
          }
        >
          {draft.woWinner === 2 ? "Quitar WO P2" : "WO P2"}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={disabled || busy}
          onClick={onSave}
        >
          {partido.estado === "completed" ? "Corregir" : "Guardar"}
        </Button>
      </div>
      <p className="liga-hint">
        Diff ≥2 → 3/0 · Diff 1 → 2/1 · Empate → STB a 5 (2/1) · WO → 3/−1
      </p>
    </div>
  );
};
