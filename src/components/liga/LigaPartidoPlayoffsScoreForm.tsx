import React from "react";
import type { LigaPartido } from "../../lib/liga/types";
import {
  emptyPlayoffsScoreDraft,
  parsePlayoffsSetScoresJson,
  playoffsMatchDisplay,
  type PlayoffsScoreDraft,
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

export function getPlayoffsDraftForPartido(
  partido: LigaPartido,
  drafts: Record<string, PlayoffsScoreDraft>
): PlayoffsScoreDraft {
  if (drafts[partido.id]) return drafts[partido.id]!;
  const payload = parsePlayoffsSetScoresJson(partido.set_scores);
  if (partido.score_pareja1 == null || partido.score_pareja2 == null) {
    return emptyPlayoffsScoreDraft();
  }
  return {
    score1: String(partido.score_pareja1),
    score2: String(partido.score_pareja2),
    stb1: payload?.stb ? String(payload.stb.p1) : "",
    stb2: payload?.stb ? String(payload.stb.p2) : "",
    woWinner: payload?.wo
      ? partido.score_pareja1 > partido.score_pareja2
        ? 1
        : 2
      : null,
  };
}

export const LigaPartidoPlayoffsScoreForm: React.FC<Props> = ({
  partido,
  draft,
  disabled,
  busy,
  onChange,
  onSave,
}) => {
  const tied =
    draft.woWinner == null &&
    draft.score1 !== "" &&
    draft.score2 !== "" &&
    Number(draft.score1) === Number(draft.score2);

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
      <div className="liga-score-row">
        <label>
          Games P1
          <input
            type="number"
            min={0}
            disabled={disabled || busy || draft.woWinner != null}
            value={draft.woWinner != null ? "" : draft.score1}
            onChange={(e) =>
              onChange({ ...draft, score1: e.target.value, woWinner: null })
            }
          />
        </label>
        <label>
          Games P2
          <input
            type="number"
            min={0}
            disabled={disabled || busy || draft.woWinner != null}
            value={draft.woWinner != null ? "" : draft.score2}
            onChange={(e) =>
              onChange({ ...draft, score2: e.target.value, woWinner: null })
            }
          />
        </label>
      </div>
      {tied ? (
        <div className="liga-score-row">
          <label>
            STB P1
            <input
              type="number"
              min={0}
              disabled={disabled || busy}
              value={draft.stb1}
              onChange={(e) => onChange({ ...draft, stb1: e.target.value })}
            />
          </label>
          <label>
            STB P2
            <input
              type="number"
              min={0}
              disabled={disabled || busy}
              value={draft.stb2}
              onChange={(e) => onChange({ ...draft, stb2: e.target.value })}
            />
          </label>
        </div>
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
