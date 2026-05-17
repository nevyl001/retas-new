import React from "react";
import "../../styles/standings-dif.css";
import {
  computeStandingDif,
  formatStandingDif,
  standingDifCellClass,
} from "../../utils/standingsDisplay";

interface StandingsDifCellProps {
  ptsFav: number;
  ptsCon: number;
  className?: string;
}

export const StandingsDifCell: React.FC<StandingsDifCellProps> = ({
  ptsFav,
  ptsCon,
  className = "new-stats-cell",
}) => {
  const dif = computeStandingDif(ptsFav, ptsCon);
  return (
    <td className={`${className} ${standingDifCellClass(dif)}`.trim()}>
      {formatStandingDif(dif)}
    </td>
  );
};
