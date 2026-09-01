import React from "react";

export interface CourtFilterProps {
  canchas: number[];
  value: number | "all";
  onChange: (value: number | "all") => void;
}

export const CourtFilter: React.FC<CourtFilterProps> = ({
  canchas,
  value,
  onChange,
}) => (
  <div
    className="jornada-court-filter"
    role="tablist"
    aria-label="Filtrar por cancha"
  >
    <button
      type="button"
      role="tab"
      aria-selected={value === "all"}
      className={`jornada-court-filter__seg${
        value === "all" ? " jornada-court-filter__seg--active" : ""
      }`}
      onClick={() => onChange("all")}
    >
      Todas
    </button>
    {canchas.map((n) => (
      <button
        key={n}
        type="button"
        role="tab"
        aria-selected={value === n}
        className={`jornada-court-filter__seg${
          value === n ? " jornada-court-filter__seg--active" : ""
        }`}
        onClick={() => onChange(n)}
      >
        C{n}
      </button>
    ))}
  </div>
);
