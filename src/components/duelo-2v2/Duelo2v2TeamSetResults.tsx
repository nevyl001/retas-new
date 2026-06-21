import React from "react";
import { getTeamSetResults } from "../../lib/duelo2v2/scoring";
import type { Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";

interface Duelo2v2TeamSetResultsProps {
  detalle: Duelo2v2SetDetalle[];
  side: "a" | "b";
}

export const Duelo2v2TeamSetResults: React.FC<Duelo2v2TeamSetResultsProps> = ({
  detalle,
  side,
}) => {
  const sets = getTeamSetResults(detalle, side);
  const wonSets = sets.filter((s) => s.won);

  if (wonSets.length === 0) return null;

  return (
    <div className="duelo2v2-live-team__sets" aria-label="Sets ganados">
      <p className="duelo2v2-live-team__sets-title">Sets ganados</p>
      <ul className="duelo2v2-live-team__sets-list">
        {wonSets.map((set) => (
          <li key={set.setNumber} className="duelo2v2-live-team__set-item">
            <span className="duelo2v2-live-team__set-label">Set {set.setNumber}</span>
            <span className="duelo2v2-live-team__set-score">
              {set.gamesFor}–{set.gamesAgainst}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
