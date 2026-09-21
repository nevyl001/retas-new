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
  const complete = total > 0 && capturados >= total;

  return (
    <div className="jornada-results-toolbar">
      <div className="jornada-results-toolbar__lead">
        <div className="jornada-results-toolbar__heading">
          <h2 className="jornada-results-toolbar__title">Resultados</h2>
          <span
            className={`jornada-results-toolbar__badge${
              complete ? " jornada-results-toolbar__badge--done" : ""
            }`}
            role="status"
          >
            {capturados}
            <span className="jornada-results-toolbar__badge-sep" aria-hidden>
              /
            </span>
            {total}
            <span className="jornada-results-toolbar__badge-label">
              capturados
            </span>
          </span>
        </div>
        <div
          className="jornada-results-toolbar__track"
          aria-hidden="true"
          title={`${percent}%`}
        >
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
