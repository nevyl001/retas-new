import React from "react";
import {
  computeDueloScore,
  formatSetScoreLine,
} from "../../lib/duelo2v2/scoring";
import type { Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";

interface Duelo2v2SetsBreakdownProps {
  detalle: Duelo2v2SetDetalle[];
  teamAName: string;
  teamBName: string;
}

export const Duelo2v2SetsBreakdown: React.FC<Duelo2v2SetsBreakdownProps> = ({
  detalle,
  teamAName,
  teamBName,
}) => {
  if (detalle.length === 0) return null;

  const summary = computeDueloScore(detalle);

  return (
    <div className="duelo2v2-sets-breakdown" aria-label="Detalle por set">
      <p className="duelo2v2-sets-breakdown__head">
        {teamAName} {summary.setsWonA} – {summary.setsWonB} {teamBName}
      </p>
      <ul className="duelo2v2-sets-breakdown__list">
        {detalle.map((row, index) => (
          <li key={index}>
            {formatSetScoreLine(index, row, summary.setOutcomes[index] ?? "incompleto")}
          </li>
        ))}
      </ul>
    </div>
  );
};
