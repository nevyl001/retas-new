import React from "react";
import { Button } from "./ui";
import { TablerIcon } from "./ui/TablerIcon";

interface CompetitionControlBarProps {
  tournament: {
    is_finished: boolean;
    is_started: boolean;
    name?: string | null;
  };
  pairsCount: number;
  matchesCount: number;
  loading: boolean;
  onReset: () => void;
}

/**
 * Barra superior de competencia en curso — sin acordeón.
 * Estado + reset en una sola franja full-width.
 */
export const CompetitionControlBar: React.FC<CompetitionControlBarProps> = ({
  tournament,
  pairsCount,
  matchesCount,
  loading,
  onReset,
}) => {
  const estadoLabel = tournament.is_finished
    ? "Finalizada"
    : tournament.is_started
      ? "En progreso"
      : "Pendiente";

  return (
    <header className="qm-comp-bar" aria-label="Control de competencia">
      <div className="qm-comp-bar__main">
        <div className="qm-comp-bar__identity">
          <p className="qm-comp-bar__eyebrow">Competencia en curso</p>
          <h2 className="qm-comp-bar__title">
            {tournament.name?.trim() || "Reta"}
          </h2>
          <p className="qm-comp-bar__hint">
            Anota resultados en los partidos. Un marcador y Guardar bastan.
          </p>
        </div>

        <dl className="qm-comp-bar__stats">
          <div className="qm-comp-bar__stat">
            <dt>Estado</dt>
            <dd>
              <span
                className={`qm-comp-bar__dot${
                  tournament.is_finished
                    ? " qm-comp-bar__dot--done"
                    : tournament.is_started
                      ? " qm-comp-bar__dot--live"
                      : ""
                }`}
                aria-hidden
              />
              {estadoLabel}
            </dd>
          </div>
          <div className="qm-comp-bar__stat">
            <dt>Parejas</dt>
            <dd>{pairsCount}</dd>
          </div>
          <div className="qm-comp-bar__stat">
            <dt>Partidos</dt>
            <dd>{matchesCount}</dd>
          </div>
        </dl>
      </div>

      {!tournament.is_finished ? (
        <div className="qm-comp-bar__actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="qm-comp-bar__reset"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!loading) onReset();
            }}
            loading={loading}
            title="Borra partidos y clasificación. Las parejas se mantienen."
          >
            <TablerIcon name="refresh" size={14} />
            {loading ? "Reseteando…" : "Resetear"}
          </Button>
        </div>
      ) : null}
    </header>
  );
};

export default CompetitionControlBar;
