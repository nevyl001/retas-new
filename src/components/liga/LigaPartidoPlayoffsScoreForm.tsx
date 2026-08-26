import React from "react";
import type { LigaPartido } from "../../lib/liga/types";
import {
  emptyPlayoffsScoreDraft,
  needsPlayoffsStbDraft,
  parsePlayoffsSetScoresJson,
  playoffsMatchDisplay,
  playoffsSetsFromDraft,
  playoffsTotalsFromDraft,
  previewPlayoffsPointsFromDraft,
  type PlayoffsScoreDraft,
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
  if (trimmed.length <= 22) return trimmed;
  return `${trimmed.slice(0, 20)}…`;
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
  const sets = playoffsSetsFromDraft(draft);
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
        <p className="liga-playoffs-score__saved">
          Resultado guardado: {saved}
        </p>
      ) : null}

      <div className="liga-playoffs-score__board" role="group" aria-label="Marcador">
        <div className="liga-playoffs-score__board-head">
          <span className="liga-playoffs-score__board-label" aria-hidden>
            {" "}
          </span>
          <span className="liga-playoffs-score__board-pair" title={left}>
            {shortPairLabel(left)}
          </span>
          <span className="liga-playoffs-score__board-pair" title={right}>
            {shortPairLabel(right)}
          </span>
        </div>

        <div className="liga-playoffs-score__board-row">
          <span className="liga-playoffs-score__board-label">Set 1</span>
          <input
            type="number"
            min={0}
            disabled={locked}
            value={draft.set1.p1}
            onChange={(e) =>
              onChange({
                ...draft,
                set1: { ...draft.set1, p1: e.target.value },
                woWinner: null,
              })
            }
            aria-label={`Set 1: games de ${left}`}
          />
          <input
            type="number"
            min={0}
            disabled={locked}
            value={draft.set1.p2}
            onChange={(e) =>
              onChange({
                ...draft,
                set1: { ...draft.set1, p2: e.target.value },
                woWinner: null,
              })
            }
            aria-label={`Set 1: games de ${right}`}
          />
        </div>

        <div className="liga-playoffs-score__board-row">
          <span className="liga-playoffs-score__board-label">Set 2</span>
          <input
            type="number"
            min={0}
            disabled={locked}
            value={draft.set2.p1}
            onChange={(e) =>
              onChange({
                ...draft,
                set2: { ...draft.set2, p1: e.target.value },
                woWinner: null,
              })
            }
            aria-label={`Set 2: games de ${left}`}
          />
          <input
            type="number"
            min={0}
            disabled={locked}
            value={draft.set2.p2}
            onChange={(e) =>
              onChange({
                ...draft,
                set2: { ...draft.set2, p2: e.target.value },
                woWinner: null,
              })
            }
            aria-label={`Set 2: games de ${right}`}
          />
        </div>

        <div
          className="liga-playoffs-score__board-row liga-playoffs-score__board-row--totals"
          aria-live="polite"
        >
          <span className="liga-playoffs-score__board-label">Sets</span>
          <strong>{sets ? sets.setsP1 : "—"}</strong>
          <strong>{sets ? sets.setsP2 : "—"}</strong>
        </div>

        {showStb ? (
          <div className="liga-playoffs-score__board-row liga-playoffs-score__board-row--stb">
            <span className="liga-playoffs-score__board-label">STB a 5</span>
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
          </div>
        ) : null}
      </div>

      {preview.kind !== "incomplete" && preview.kind !== "wo" ? (
        <p
          className={`liga-playoffs-score__preview liga-playoffs-score__preview--${preview.kind}`}
          role="status"
        >
          <strong>{preview.title}</strong>
          <span>{preview.line}</span>
          {totals && preview.kind !== "needs_stb" ? (
            <span className="liga-playoffs-score__preview-games">
              Games {totals.score1}–{totals.score2}
            </span>
          ) : null}
        </p>
      ) : showStb ? (
        <p className="liga-playoffs-score__stb-hint" role="status">
          Empate 1-1 en sets: registra el Súper Tie-Break a 5.
        </p>
      ) : null}

      <div className="liga-playoffs-score__actions">
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
    </div>
  );
};
