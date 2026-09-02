import React, { useMemo } from "react";
import type { LigaJornada, LigaPartido } from "../../../lib/liga/types";
import {
  formatSetScoresDisplay,
  needsSuperTiebreakDraft,
  normalizeParejasFijasDraft,
  validateParejasFijasDraft,
  type ParejasFijasSetsDraft,
} from "../../../lib/liga/parejasFijasMatchScore";
import {
  needsPlayoffsStbDraft,
  playoffsMatchDisplay,
  parsePlayoffsSetScoresJson,
  type PlayoffsScoreDraft,
} from "../../../lib/liga/parejasFijasPlayoffsMatchScore";
import { LigaScoreInput } from "../LigaScoreInput";
import { parejaPlayerNames } from "./jornadaAdminUtils";

export type MatchScoreCardMode = "sets" | "playoffs" | "rotativo";

export interface MatchScoreCardProps {
  partido: LigaPartido;
  jornada: LigaJornada;
  mode: MatchScoreCardMode;
  locked?: boolean;
  busy?: boolean;
  justSaved?: boolean;
  pareja1Label: string;
  pareja2Label: string;
  setsDraft?: ParejasFijasSetsDraft;
  playoffsDraft?: PlayoffsScoreDraft;
  rotativoDraft?: { s1: string; s2: string };
  onSetsChange?: (next: ParejasFijasSetsDraft) => void;
  onPlayoffsChange?: (next: PlayoffsScoreDraft) => void;
  onRotativoChange?: (next: { s1: string; s2: string }) => void;
  onSave: () => void;
}

function savedScoreLine(
  partido: LigaPartido,
  mode: MatchScoreCardMode,
  esPlayoffs: boolean
): string | null {
  if (partido.estado !== "completed") return null;
  if (
    esPlayoffs &&
    partido.score_pareja1 != null &&
    partido.score_pareja2 != null
  ) {
    return playoffsMatchDisplay(
      partido.score_pareja1,
      partido.score_pareja2,
      parsePlayoffsSetScoresJson(partido.set_scores)
    );
  }
  const legacyScores =
    partido.set_scores &&
    typeof partido.set_scores === "object" &&
    "sets" in partido.set_scores
      ? (partido.set_scores as import("../../../lib/liga/parejasFijasMatchScore").LigaPartidoSetScores)
      : null;
  if (legacyScores?.sets?.length) {
    return formatSetScoresDisplay(legacyScores.sets);
  }
  if (partido.score_pareja1 != null && partido.score_pareja2 != null) {
    if (mode === "rotativo") {
      return `${partido.score_pareja1} – ${partido.score_pareja2}`;
    }
    if (
      partido.score_pareja1 != null &&
      partido.score_pareja2 != null
    ) {
      return `${partido.score_pareja1} – ${partido.score_pareja2}`;
    }
  }
  return null;
}

function scoreFieldId(partidoId: string, suffix: string): string {
  return `liga-partido-${partidoId}-${suffix}`;
}

function pairMarkerLabel(label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 24) return trimmed;
  const slash = trimmed.indexOf(" / ");
  if (slash > 0) {
    const left = trimmed.slice(0, slash).trim();
    const right = trimmed.slice(slash + 3).trim();
    const initials = (name: string) =>
      name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}.`)
        .join(" ");
    return `${initials(left)} / ${initials(right)}`;
  }
  return `${trimmed.slice(0, 22)}…`;
}

interface PairSetsRowProps {
  pairLabel: string;
  fullLabel: string;
  set1Value: string;
  set2Value: string;
  set3Value?: string;
  showSet3: boolean;
  disabled: boolean;
  fieldPrefix: string;
  onSet1Change: (value: string) => void;
  onSet2Change: (value: string) => void;
  onSet3Change?: (value: string) => void;
}

const PairSetsRow: React.FC<PairSetsRowProps> = ({
  pairLabel,
  fullLabel,
  set1Value,
  set2Value,
  set3Value = "",
  showSet3,
  disabled,
  fieldPrefix,
  onSet1Change,
  onSet2Change,
  onSet3Change,
}) => (
  <div
    className={`jornada-match-card__sets-pair-row${
      showSet3 ? " jornada-match-card__sets-pair-row--stb" : ""
    }`}
  >
    <span
      className="jornada-match-card__pair-side-label"
      title={fullLabel}
    >
      {pairMarkerLabel(pairLabel)}
    </span>
    <LigaScoreInput
      id={`${fieldPrefix}-set1`}
      value={set1Value}
      onChange={onSet1Change}
      disabled={disabled}
      ariaLabel={`Set 1 ${fullLabel}`}
    />
    <LigaScoreInput
      id={`${fieldPrefix}-set2`}
      value={set2Value}
      onChange={onSet2Change}
      disabled={disabled}
      ariaLabel={`Set 2 ${fullLabel}`}
    />
    {showSet3 && onSet3Change ? (
      <LigaScoreInput
        id={`${fieldPrefix}-set3`}
        value={set3Value}
        onChange={onSet3Change}
        disabled={disabled}
        ariaLabel={`Set 3 ${fullLabel}`}
      />
    ) : null}
  </div>
);

export const MatchScoreCard: React.FC<MatchScoreCardProps> = ({
  partido,
  jornada,
  mode,
  locked,
  busy,
  justSaved,
  pareja1Label,
  pareja2Label,
  setsDraft,
  playoffsDraft,
  rotativoDraft,
  onSetsChange,
  onPlayoffsChange,
  onRotativoChange,
  onSave,
}) => {
  const team1 = parejaPlayerNames(partido.pareja1_id, jornada);
  const team2 = parejaPlayerNames(partido.pareja2_id, jornada);
  const cancha = partido.cancha != null ? partido.cancha : null;
  const isSaved = partido.estado === "completed";
  const savedLine = savedScoreLine(partido, mode, mode === "playoffs");

  const setsValidation = useMemo(() => {
    if (mode !== "sets" || !setsDraft) return null;
    return validateParejasFijasDraft(setsDraft);
  }, [mode, setsDraft]);

  const showSet3 =
    mode === "sets" && setsDraft ? needsSuperTiebreakDraft(setsDraft) : false;
  const showStb =
    mode === "playoffs" && playoffsDraft
      ? needsPlayoffsStbDraft(playoffsDraft)
      : false;

  const disabled = Boolean(locked || busy);
  const canSaveSets =
    mode === "sets" && setsDraft && !setsValidation && !disabled;
  const canSaveRotativo =
    mode === "rotativo" &&
    rotativoDraft &&
    rotativoDraft.s1.trim() !== "" &&
    rotativoDraft.s2.trim() !== "" &&
    !disabled;

  const headerMeta = cancha != null ? `Cancha ${cancha}` : "";
  const fieldPrefix = scoreFieldId(partido.id, "pair");

  return (
    <article
      className={`jornada-match-card${
        isSaved ? " jornada-match-card--saved" : ""
      }${locked ? " jornada-match-card--locked" : ""}`}
    >
      <header className="jornada-match-card__head">
        <span className="jornada-match-card__meta">
          {headerMeta || "Sin programar"}
        </span>
        {isSaved ? (
          <span className="jornada-match-card__badge">Guardado</span>
        ) : null}
      </header>

      <div className="jornada-match-card__teams">
        <div className="jornada-match-card__team">
          <span>{team1.name1}</span>
          <span>{team1.name2}</span>
        </div>
        <span className="jornada-match-card__vs">VS</span>
        <div className="jornada-match-card__team jornada-match-card__team--right">
          <span>{team2.name1}</span>
          <span>{team2.name2}</span>
        </div>
      </div>

      {isSaved && savedLine ? (
        <p className="jornada-match-card__saved-line">{savedLine}</p>
      ) : null}

      {mode === "sets" && setsDraft && onSetsChange ? (
        <div className="jornada-match-card__scoreboard">
          <div
            className={`jornada-match-card__sets-grid${
              showSet3 ? " jornada-match-card__sets-grid--stb" : ""
            }`}
          >
            <div
              className={`jornada-match-card__sets-head${
                showSet3 ? " jornada-match-card__sets-head--stb" : ""
              }`}
              aria-hidden
            >
              <span className="jornada-match-card__sets-pair-spacer">Pareja</span>
              <span className="jornada-match-card__set-label">Set 1</span>
              <span className="jornada-match-card__set-label">Set 2</span>
              {showSet3 ? (
                <span className="jornada-match-card__set-label">
                  Set 3 (STB)
                </span>
              ) : null}
            </div>
            <PairSetsRow
              pairLabel={pareja1Label}
              fullLabel={pareja1Label}
              set1Value={setsDraft.set1.p1}
              set2Value={setsDraft.set2.p1}
              set3Value={setsDraft.set3.p1}
              showSet3={showSet3}
              disabled={disabled}
              fieldPrefix={`${fieldPrefix}-p1`}
              onSet1Change={(p1) =>
                onSetsChange(
                  normalizeParejasFijasDraft({
                    ...setsDraft,
                    set1: { ...setsDraft.set1, p1 },
                  })
                )
              }
              onSet2Change={(p1) =>
                onSetsChange(
                  normalizeParejasFijasDraft({
                    ...setsDraft,
                    set2: { ...setsDraft.set2, p1 },
                  })
                )
              }
              onSet3Change={(p1) =>
                onSetsChange(
                  normalizeParejasFijasDraft({
                    ...setsDraft,
                    set3: { ...setsDraft.set3, p1 },
                  })
                )
              }
            />
            <PairSetsRow
              pairLabel={pareja2Label}
              fullLabel={pareja2Label}
              set1Value={setsDraft.set1.p2}
              set2Value={setsDraft.set2.p2}
              set3Value={setsDraft.set3.p2}
              showSet3={showSet3}
              disabled={disabled}
              fieldPrefix={`${fieldPrefix}-p2`}
              onSet1Change={(p2) =>
                onSetsChange(
                  normalizeParejasFijasDraft({
                    ...setsDraft,
                    set1: { ...setsDraft.set1, p2 },
                  })
                )
              }
              onSet2Change={(p2) =>
                onSetsChange(
                  normalizeParejasFijasDraft({
                    ...setsDraft,
                    set2: { ...setsDraft.set2, p2 },
                  })
                )
              }
              onSet3Change={(p2) =>
                onSetsChange(
                  normalizeParejasFijasDraft({
                    ...setsDraft,
                    set3: { ...setsDraft.set3, p2 },
                  })
                )
              }
            />
          </div>
          {setsValidation ? (
            <p className="jornada-match-card__error" role="alert">
              {setsValidation}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "playoffs" && playoffsDraft && onPlayoffsChange ? (
        <div className="jornada-match-card__scoreboard">
          <div
            className={`jornada-match-card__sets-grid${
              showStb ? " jornada-match-card__sets-grid--stb" : ""
            }`}
          >
            <div
              className={`jornada-match-card__sets-head${
                showStb ? " jornada-match-card__sets-head--stb" : ""
              }`}
              aria-hidden
            >
              <span className="jornada-match-card__sets-pair-spacer">Pareja</span>
              <span className="jornada-match-card__set-label">Set 1</span>
              <span className="jornada-match-card__set-label">Set 2</span>
              {showStb ? (
                <span className="jornada-match-card__set-label">STB (5)</span>
              ) : null}
            </div>
            <PairSetsRow
              pairLabel={pareja1Label}
              fullLabel={pareja1Label}
              set1Value={playoffsDraft.set1.p1}
              set2Value={playoffsDraft.set2.p1}
              set3Value={playoffsDraft.stb1}
              showSet3={showStb}
              disabled={disabled}
              fieldPrefix={`${fieldPrefix}-playoffs-p1`}
              onSet1Change={(p1) =>
                onPlayoffsChange({
                  ...playoffsDraft,
                  set1: { ...playoffsDraft.set1, p1 },
                  woWinner: null,
                })
              }
              onSet2Change={(p1) =>
                onPlayoffsChange({
                  ...playoffsDraft,
                  set2: { ...playoffsDraft.set2, p1 },
                  woWinner: null,
                })
              }
              onSet3Change={(stb1) =>
                onPlayoffsChange({ ...playoffsDraft, stb1, woWinner: null })
              }
            />
            <PairSetsRow
              pairLabel={pareja2Label}
              fullLabel={pareja2Label}
              set1Value={playoffsDraft.set1.p2}
              set2Value={playoffsDraft.set2.p2}
              set3Value={playoffsDraft.stb2}
              showSet3={showStb}
              disabled={disabled}
              fieldPrefix={`${fieldPrefix}-playoffs-p2`}
              onSet1Change={(p2) =>
                onPlayoffsChange({
                  ...playoffsDraft,
                  set1: { ...playoffsDraft.set1, p2 },
                  woWinner: null,
                })
              }
              onSet2Change={(p2) =>
                onPlayoffsChange({
                  ...playoffsDraft,
                  set2: { ...playoffsDraft.set2, p2 },
                  woWinner: null,
                })
              }
              onSet3Change={(stb2) =>
                onPlayoffsChange({ ...playoffsDraft, stb2, woWinner: null })
              }
            />
          </div>
        </div>
      ) : null}

      {mode === "rotativo" && rotativoDraft && onRotativoChange ? (
        <div className="jornada-match-card__scoreboard">
          <span className="jornada-match-card__set-label">Marcador</span>
          <div className="jornada-match-card__rotativo-scores">
            <div className="jornada-match-card__rotativo-side">
              <span
                className="jornada-match-card__pair-side-label"
                title={pareja1Label}
              >
                {pairMarkerLabel(pareja1Label)}
              </span>
              <LigaScoreInput
                id={scoreFieldId(partido.id, "rotativo-s1")}
                value={rotativoDraft.s1}
                onChange={(s1) => onRotativoChange({ ...rotativoDraft, s1 })}
                disabled={disabled}
                ariaLabel={`Puntos ${pareja1Label}`}
              />
            </div>
            <div className="jornada-match-card__rotativo-side">
              <span
                className="jornada-match-card__pair-side-label"
                title={pareja2Label}
              >
                {pairMarkerLabel(pareja2Label)}
              </span>
              <LigaScoreInput
                id={scoreFieldId(partido.id, "rotativo-s2")}
                value={rotativoDraft.s2}
                onChange={(s2) => onRotativoChange({ ...rotativoDraft, s2 })}
                disabled={disabled}
                ariaLabel={`Puntos ${pareja2Label}`}
              />
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="jornada-match-card__save"
        disabled={
          disabled ||
          (mode === "sets" && !canSaveSets) ||
          (mode === "rotativo" && !canSaveRotativo)
        }
        onClick={onSave}
      >
        {justSaved ? "Guardado" : "Guardar resultado"}
      </button>
    </article>
  );
};
