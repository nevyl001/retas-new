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
import { parejaPlayerNames, partidoHora } from "./jornadaAdminUtils";

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
  const hora = partidoHora(partido);
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

  const headerMeta = [
    cancha != null ? `Cancha ${cancha}` : null,
    hora || null,
  ]
    .filter(Boolean)
    .join(" ");

  const scoreFieldId = (suffix: string) =>
    `liga-partido-${partido.id}-${suffix}`;

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
          <div className="jornada-match-card__sets-row">
            <div className="jornada-match-card__set-col">
              <span className="jornada-match-card__set-label">Set 1</span>
              <div className="jornada-match-card__set-inputs">
                <LigaScoreInput
                  id={scoreFieldId("set1-p1")}
                  value={setsDraft.set1.p1}
                  onChange={(p1) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set1: { ...setsDraft.set1, p1 },
                      })
                    )
                  }
                  disabled={disabled}
                  ariaLabel={`Set 1 ${pareja1Label}`}
                />
                <LigaScoreInput
                  id={scoreFieldId("set1-p2")}
                  value={setsDraft.set1.p2}
                  onChange={(p2) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set1: { ...setsDraft.set1, p2 },
                      })
                    )
                  }
                  disabled={disabled}
                  ariaLabel={`Set 1 ${pareja2Label}`}
                />
              </div>
            </div>
            <div className="jornada-match-card__set-col">
              <span className="jornada-match-card__set-label">Set 2</span>
              <div className="jornada-match-card__set-inputs">
                <LigaScoreInput
                  id={scoreFieldId("set2-p1")}
                  value={setsDraft.set2.p1}
                  onChange={(p1) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set2: { ...setsDraft.set2, p1 },
                      })
                    )
                  }
                  disabled={disabled}
                  ariaLabel={`Set 2 ${pareja1Label}`}
                />
                <LigaScoreInput
                  id={scoreFieldId("set2-p2")}
                  value={setsDraft.set2.p2}
                  onChange={(p2) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set2: { ...setsDraft.set2, p2 },
                      })
                    )
                  }
                  disabled={disabled}
                  ariaLabel={`Set 2 ${pareja2Label}`}
                />
              </div>
            </div>
          </div>
          {showSet3 ? (
            <div className="jornada-match-card__set3">
              <span className="jornada-match-card__set-label">
                Set 3 (súper tie-break)
              </span>
              <div className="jornada-match-card__set-inputs jornada-match-card__set-inputs--center">
                <LigaScoreInput
                  id={scoreFieldId("set3-p1")}
                  value={setsDraft.set3.p1}
                  onChange={(p1) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set3: { ...setsDraft.set3, p1 },
                      })
                    )
                  }
                  disabled={disabled}
                  ariaLabel={`Set 3 ${pareja1Label}`}
                />
                <LigaScoreInput
                  id={scoreFieldId("set3-p2")}
                  value={setsDraft.set3.p2}
                  onChange={(p2) =>
                    onSetsChange(
                      normalizeParejasFijasDraft({
                        ...setsDraft,
                        set3: { ...setsDraft.set3, p2 },
                      })
                    )
                  }
                  disabled={disabled}
                  ariaLabel={`Set 3 ${pareja2Label}`}
                />
              </div>
            </div>
          ) : null}
          {setsValidation ? (
            <p className="jornada-match-card__error" role="alert">
              {setsValidation}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "playoffs" && playoffsDraft && onPlayoffsChange ? (
        <div className="jornada-match-card__scoreboard">
          <div className="jornada-match-card__sets-row">
            <div className="jornada-match-card__set-col">
              <span className="jornada-match-card__set-label">Set 1</span>
              <div className="jornada-match-card__set-inputs">
                <LigaScoreInput
                  id={scoreFieldId("playoffs-set1-p1")}
                  value={playoffsDraft.set1.p1}
                  onChange={(p1) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set1: { ...playoffsDraft.set1, p1 },
                      woWinner: null,
                    })
                  }
                  disabled={disabled}
                  ariaLabel={`Set 1 ${pareja1Label}`}
                />
                <LigaScoreInput
                  id={scoreFieldId("playoffs-set1-p2")}
                  value={playoffsDraft.set1.p2}
                  onChange={(p2) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set1: { ...playoffsDraft.set1, p2 },
                      woWinner: null,
                    })
                  }
                  disabled={disabled}
                  ariaLabel={`Set 1 ${pareja2Label}`}
                />
              </div>
            </div>
            <div className="jornada-match-card__set-col">
              <span className="jornada-match-card__set-label">Set 2</span>
              <div className="jornada-match-card__set-inputs">
                <LigaScoreInput
                  id={scoreFieldId("playoffs-set2-p1")}
                  value={playoffsDraft.set2.p1}
                  onChange={(p1) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set2: { ...playoffsDraft.set2, p1 },
                      woWinner: null,
                    })
                  }
                  disabled={disabled}
                  ariaLabel={`Set 2 ${pareja1Label}`}
                />
                <LigaScoreInput
                  id={scoreFieldId("playoffs-set2-p2")}
                  value={playoffsDraft.set2.p2}
                  onChange={(p2) =>
                    onPlayoffsChange({
                      ...playoffsDraft,
                      set2: { ...playoffsDraft.set2, p2 },
                      woWinner: null,
                    })
                  }
                  disabled={disabled}
                  ariaLabel={`Set 2 ${pareja2Label}`}
                />
              </div>
            </div>
          </div>
          {showStb ? (
            <div className="jornada-match-card__set3">
              <span className="jornada-match-card__set-label">
                Súper tie-break (a 5)
              </span>
              <div className="jornada-match-card__set-inputs jornada-match-card__set-inputs--center">
                <LigaScoreInput
                  id={scoreFieldId("playoffs-stb-p1")}
                  value={playoffsDraft.stb1}
                  onChange={(stb1) =>
                    onPlayoffsChange({ ...playoffsDraft, stb1, woWinner: null })
                  }
                  disabled={disabled}
                  ariaLabel={`STB ${pareja1Label}`}
                />
                <LigaScoreInput
                  id={scoreFieldId("playoffs-stb-p2")}
                  value={playoffsDraft.stb2}
                  onChange={(stb2) =>
                    onPlayoffsChange({ ...playoffsDraft, stb2, woWinner: null })
                  }
                  disabled={disabled}
                  ariaLabel={`STB ${pareja2Label}`}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "rotativo" && rotativoDraft && onRotativoChange ? (
        <div className="jornada-match-card__scoreboard">
          <span className="jornada-match-card__set-label">Marcador</span>
          <div className="jornada-match-card__set-inputs jornada-match-card__set-inputs--center">
            <LigaScoreInput
              id={scoreFieldId("rotativo-s1")}
              value={rotativoDraft.s1}
              onChange={(s1) => onRotativoChange({ ...rotativoDraft, s1 })}
              disabled={disabled}
              ariaLabel={`Puntos ${pareja1Label}`}
            />
            <LigaScoreInput
              id={scoreFieldId("rotativo-s2")}
              value={rotativoDraft.s2}
              onChange={(s2) => onRotativoChange({ ...rotativoDraft, s2 })}
              disabled={disabled}
              ariaLabel={`Puntos ${pareja2Label}`}
            />
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
