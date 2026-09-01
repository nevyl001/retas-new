import React from "react";
import { CourtFilter } from "./CourtFilter";

export interface ResultsToolbarProps {
  capturados: number;
  total: number;
  canchas: number[];
  canchaFilter: number | "all";
  onCanchaFilterChange: (value: number | "all") => void;
}

export const ResultsToolbar: React.FC<ResultsToolbarProps> = ({
  capturados,
  total,
  canchas,
  canchaFilter,
  onCanchaFilterChange,
}) => {
  const percent = total > 0 ? Math.round((capturados / total) * 100) : 0;

  return (
    <div className="jornada-results-toolbar">
      <div className="jornada-results-toolbar__progress" role="status">
        <span className="jornada-results-toolbar__title">Resultados</span>
        <span className="jornada-results-toolbar__count">
          {capturados} / {total} capturados
        </span>
        <div className="jornada-results-toolbar__track" aria-hidden="true">
          <div
            className="jornada-results-toolbar__fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {canchas.length > 0 ? (
        <CourtFilter
          canchas={canchas}
          value={canchaFilter}
          onChange={onCanchaFilterChange}
        />
      ) : null}
    </div>
  );
};
