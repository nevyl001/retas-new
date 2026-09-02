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
    return `${partido.score_pareja1} – ${partido.score_pareja2}`;
  }
  return null;
}

function scoreFieldId(partidoId: string, suffix: string): string {
  return `liga-partido-${partidoId}-${suffix}`;
}

interface ScoreFieldProps {
  id: string;
  label: string;
  value: string;
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  maxLength?: number;
}

const ScoreField: React.FC<ScoreFieldProps> = ({
  id,
  label,
  value,
  ariaLabel,
  disabled,
  onChange,
  maxLength,
}) => (
  <div className="jornada-match-card__pair-set-field">
    <label className="jornada-match-card__field-label" htmlFor={id}>
      {label}
    </label>
    <LigaScoreInput
      id={id}
      value={value}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      maxLength={maxLength}
    />
  </div>
);

interface PairScoreBlockProps {
  name1: string;
  name2: string;
  side: "a" | "b";
  children: React.ReactNode;
}

const PairScoreBlock: React.FC<PairScoreBlockProps> = ({
  name1,
  name2,
  side,
  children,
}) => (
  <div
    className={`jornada-match-card__pair-block jornada-match-card__pair-block--${side}`}
  >
    <div className="jornada-match-card__pair-names">
      <span>{name1}</span>
      <span>{name2}</span>
    </div>
    <div className="jornada-match-card__pair-sets">{children}</div>
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
  const showScoreEntry =
    !isSaved &&
    ((mode === "sets" && setsDraft && onSetsChange) ||
      (mode === "playoffs" && playoffsDraft && onPlayoffsChange) ||
      (mode === "rotativo" && rotativoDraft && onRotativoChange));

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

      {showScoreEntry ? (
        <div className="jornada-match-card__matchup">
          {mode === "sets" && setsDraft && onSetsChange ? (
            <>
              <PairScoreBlock
                name1={team1.name1}
                name2={team1.name2}
                side="a"
              >
                <ScoreField
                  id={scoreFieldId(partido.id, "set1-p1")}
                  label="Set 1"
                  value={setsDraft.set1.p1}
                  ariaLabel={`Set 1 de ${pareja1Label}`}
                  disabled={disabled}
                  onChange={(p1) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set1: { ...setsDraft.set1, p1 },
                      })
                    )
                  }
                />
                <ScoreField
                  id={scoreFieldId(partido.id, "set2-p1")}
                  label="Set 2"
                  value={setsDraft.set2.p1}
                  ariaLabel={`Set 2 de ${pareja1Label}`}
                  disabled={disabled}
                  onChange={(p1) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set2: { ...setsDraft.set2, p1 },
                      })
                    )
                  }
                />
                {showSet3 ? (
                  <ScoreField
                    id={scoreFieldId(partido.id, "set3-p1")}
                    label="Set 3 STB"
                    value={setsDraft.set3.p1}
                    ariaLabel={`Set 3 súper tie-break de ${pareja1Label}`}
                    disabled={disabled}
                    maxLength={2}
                    onChange={(p1) =>
                      onSetsChange(
                        normalizeParejasFijasDraft({
                          ...setsDraft,
                          set3: { ...setsDraft.set3, p1 },
                        })
                      )
                    }
                  />
                ) : null}
              </PairScoreBlock>

              <span className="jornada-match-card__vs jornada-match-card__vs--between">
                VS
              </span>

              <PairScoreBlock
                name1={team2.name1}
                name2={team2.name2}
                side="b"
              >
                <ScoreField
                  id={scoreFieldId(partido.id, "set1-p2")}
                  label="Set 1"
                  value={setsDraft.set1.p2}
                  ariaLabel={`Set 1 de ${pareja2Label}`}
                  disabled={disabled}
                  onChange={(p2) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set1: { ...setsDraft.set1, p2 },
                      })
                    )
                  }
                />
                <ScoreField
                  id={scoreFieldId(partido.id, "set2-p2")}
                  label="Set 2"
                  value={setsDraft.set2.p2}
                  ariaLabel={`Set 2 de ${pareja2Label}`}
                  disabled={disabled}
                  onChange={(p2) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set2: { ...setsDraft.set2, p2 },
                      })
                    )
                  }
                />
                {showSet3 ? (
                  <ScoreField
                    id={scoreFieldId(partido.id, "set3-p2")}
                    label="Set 3 STB"
                    value={setsDraft.set3.p2}
                    ariaLabel={`Set 3 súper tie-break de ${pareja2Label}`}
                    disabled={disabled}
                    maxLength={2}
                    onChange={(p2) =>
                      onSetsChange(
                        normalizeParejasFijasDraft({
                          ...setsDraft,
                          set3: { ...setsDraft.set3, p2 },
                        })
                      )
                    }
                  />
                ) : null}
              </PairScoreBlock>
            </>
          ) : null}

          {mode === "playoffs" && playoffsDraft && onPlayoffsChange ? (
            <>
              <PairScoreBlock
                name1={team1.name1}
                name2={team1.name2}
                side="a"
              >
                <ScoreField
                  id={scoreFieldId(partido.id, "playoffs-set1-p1")}
                  label="Set 1"
                  value={playoffsDraft.set1.p1}
                  ariaLabel={`Set 1 de ${pareja1Label}`}
                  disabled={disabled}
                  onChange={(p1) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set1: { ...playoffsDraft.set1, p1 },
                      woWinner: null,
                    })
                  }
                />
                <ScoreField
                  id={scoreFieldId(partido.id, "playoffs-set2-p1")}
                  label="Set 2"
                  value={playoffsDraft.set2.p1}
                  ariaLabel={`Set 2 de ${pareja1Label}`}
                  disabled={disabled}
                  onChange={(p1) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set2: { ...playoffsDraft.set2, p1 },
                      woWinner: null,
                    })
                  }
                />
                {showStb ? (
                  <ScoreField
                    id={scoreFieldId(partido.id, "playoffs-stb-p1")}
                    label="STB (5)"
                    value={playoffsDraft.stb1}
                    ariaLabel={`Súper tie-break de ${pareja1Label}`}
                    disabled={disabled}
                    onChange={(stb1) =>
                      onPlayoffsChange({ ...playoffsDraft, stb1, woWinner: null })
                    }
                  />
                ) : null}
              </PairScoreBlock>

              <span className="jornada-match-card__vs jornada-match-card__vs--between">
                VS
              </span>

              <PairScoreBlock
                name1={team2.name1}
                name2={team2.name2}
                side="b"
              >
                <ScoreField
                  id={scoreFieldId(partido.id, "playoffs-set1-p2")}
                  label="Set 1"
                  value={playoffsDraft.set1.p2}
                  ariaLabel={`Set 1 de ${pareja2Label}`}
                  disabled={disabled}
                  onChange={(p2) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set1: { ...playoffsDraft.set1, p2 },
                      woWinner: null,
                    })
                  }
                />
                <ScoreField
                  id={scoreFieldId(partido.id, "playoffs-set2-p2")}
                  label="Set 2"
                  value={playoffsDraft.set2.p2}
                  ariaLabel={`Set 2 de ${pareja2Label}`}
                  disabled={disabled}
                  onChange={(p2) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set2: { ...playoffsDraft.set2, p2 },
                      woWinner: null,
                    })
                  }
                />
                {showStb ? (
                  <ScoreField
                    id={scoreFieldId(partido.id, "playoffs-stb-p2")}
                    label="STB (5)"
                    value={playoffsDraft.stb2}
                    ariaLabel={`Súper tie-break de ${pareja2Label}`}
                    disabled={disabled}
                    onChange={(stb2) =>
                      onPlayoffsChange({ ...playoffsDraft, stb2, woWinner: null })
                    }
                  />
                ) : null}
              </PairScoreBlock>
            </>
          ) : null}

          {mode === "rotativo" && rotativoDraft && onRotativoChange ? (
            <>
              <PairScoreBlock
                name1={team1.name1}
                name2={team1.name2}
                side="a"
              >
                <ScoreField
                  id={scoreFieldId(partido.id, "rotativo-s1")}
                  label="Marcador"
                  value={rotativoDraft.s1}
                  ariaLabel={`Puntos de ${pareja1Label}`}
                  disabled={disabled}
                  onChange={(s1) => onRotativoChange({ ...rotativoDraft, s1 })}
                />
              </PairScoreBlock>

              <span className="jornada-match-card__vs jornada-match-card__vs--between">
                VS
              </span>

              <PairScoreBlock
                name1={team2.name1}
                name2={team2.name2}
                side="b"
              >
                <ScoreField
                  id={scoreFieldId(partido.id, "rotativo-s2")}
                  label="Marcador"
                  value={rotativoDraft.s2}
                  ariaLabel={`Puntos de ${pareja2Label}`}
                  disabled={disabled}
                  onChange={(s2) => onRotativoChange({ ...rotativoDraft, s2 })}
                />
              </PairScoreBlock>
            </>
          ) : null}
        </div>
      ) : (
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
      )}

      {isSaved && savedLine ? (
        <p className="jornada-match-card__saved-line">{savedLine}</p>
      ) : null}

      {mode === "sets" && setsValidation ? (
        <p className="jornada-match-card__error" role="alert">
          {setsValidation}
        </p>
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
