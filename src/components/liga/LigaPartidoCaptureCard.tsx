import React from "react";
import type { LigaJornada, LigaPartido } from "../../lib/liga/types";
import type { ParejasFijasSetsDraft } from "../../lib/liga/parejasFijasMatchScore";
import type { PlayoffsScoreDraft } from "../../lib/liga/parejasFijasPlayoffsMatchScore";
import { TablerIcon } from "../ui/TablerIcon";
import { LigaPartidoPlayoffsScoreForm } from "./LigaPartidoPlayoffsScoreForm";
import {
  LigaPartidoProgramacionFields,
  type PartidoProgramacionDraft,
} from "./LigaPartidoProgramacionFields";
import { LigaPartidoSetsScoreForm } from "./LigaPartidoSetsScoreForm";
import {
  parejaPlayerNames,
  partidoCapturedSummary,
  partidoListSummary,
} from "./ligaPartidoCaptureUi";

export interface LigaPartidoCaptureCardProps {
  partido: LigaPartido;
  index: number;
  total: number;
  jornada: LigaJornada;
  expanded: boolean;
  locked: boolean;
  busy: boolean;
  esPlayoffs: boolean;
  esFijasLegacy: boolean;
  canchasDisponibles: number;
  pareja1Label: string;
  pareja2Label: string;
  setsDraft: ParejasFijasSetsDraft;
  playoffsDraft: PlayoffsScoreDraft;
  progDraft: PartidoProgramacionDraft;
  justSaved: boolean;
  onToggle: () => void;
  onProgramacionChange: (next: PartidoProgramacionDraft) => void;
  onProgramacionSave: () => void;
  onSetsChange: (next: ParejasFijasSetsDraft) => void;
  onSetsSave: () => void;
  onPlayoffsChange: (next: PlayoffsScoreDraft) => void;
  onPlayoffsSave: () => void;
}

export const LigaPartidoCaptureCard: React.FC<LigaPartidoCaptureCardProps> = ({
  partido,
  index,
  total,
  jornada,
  expanded,
  locked,
  busy,
  esPlayoffs,
  esFijasLegacy,
  canchasDisponibles,
  pareja1Label,
  pareja2Label,
  setsDraft,
  playoffsDraft,
  progDraft,
  justSaved,
  onToggle,
  onProgramacionChange,
  onProgramacionSave,
  onSetsChange,
  onSetsSave,
  onPlayoffsChange,
  onPlayoffsSave,
}) => {
  const isCaptured = partido.estado === "completed";
  const capturedLine = partidoCapturedSummary(partido, jornada, esPlayoffs);
  const summaryLine = partidoListSummary(partido, index, total, jornada);
  const team1 = parejaPlayerNames(partido.pareja1_id, jornada);
  const team2 = parejaPlayerNames(partido.pareja2_id, jornada);

  return (
    <article
      className={`liga-partido-accordion${
        expanded ? " liga-partido-accordion--open" : ""
      }${isCaptured ? " liga-partido-accordion--done" : ""}${
        locked ? " liga-partido-accordion--locked" : ""
      }`}
    >
      <button
        type="button"
        className="liga-partido-accordion__head"
        aria-expanded={expanded}
        disabled={locked}
        onClick={onToggle}
      >
        <span className="liga-partido-accordion__status" aria-hidden="true">
          {isCaptured ? "✅" : "🕒"}
        </span>
        <span className="liga-partido-accordion__summary">
          {isCaptured && !expanded && capturedLine
            ? capturedLine
            : summaryLine}
        </span>
        {expanded ? (
          <details
            className="liga-partido-accordion__rules"
            onClick={(event) => event.stopPropagation()}
          >
            <summary aria-label="Ver reglas de puntuación">ⓘ</summary>
            <p>
              {esPlayoffs
                ? "Diff >2 → 3/0 · Diff 1–2 → 2/1 · Empate en sets → STB a 5"
                : "Al mejor de 3 sets · sets 1-2 con punto de oro · set 3 super tie-break a 10"}
            </p>
          </details>
        ) : null}
        <TablerIcon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          aria-hidden={false}
        />
      </button>

      {expanded ? (
        <div className="liga-partido-accordion__body">
          <div className="liga-partido-accordion__form-inner">
            <div className="liga-partido-accordion__matchup">
              <div className="liga-partido-accordion__team">
                <span>{team1.name1}</span>
                <span>{team1.name2}</span>
              </div>
              <span className="liga-partido-accordion__matchup-vs">vs</span>
              <div className="liga-partido-accordion__team liga-partido-accordion__team--right">
                <span>{team2.name1}</span>
                <span>{team2.name2}</span>
              </div>
            </div>
            <LigaPartidoProgramacionFields
              partido={partido}
              draft={progDraft}
              canchasDisponibles={canchasDisponibles}
              disabled={locked}
              busy={busy}
              summaryMode
              compactSummary
              onChange={onProgramacionChange}
              onSave={onProgramacionSave}
            />
            {esPlayoffs ? (
              <LigaPartidoPlayoffsScoreForm
                partido={partido}
                draft={playoffsDraft}
                pareja1Label={pareja1Label}
                pareja2Label={pareja2Label}
                disabled={locked}
                busy={busy}
                justSaved={justSaved}
                compact
                onChange={onPlayoffsChange}
                onSave={onPlayoffsSave}
              />
            ) : esFijasLegacy ? (
              <LigaPartidoSetsScoreForm
                partido={partido}
                draft={setsDraft}
                pareja1Label={pareja1Label}
                pareja2Label={pareja2Label}
                disabled={locked}
                busy={busy}
                justSaved={justSaved}
                compact
                onChange={onSetsChange}
                onSave={onSetsSave}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
};
