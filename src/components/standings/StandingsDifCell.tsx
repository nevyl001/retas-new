import React from "react";
import "../../styles/standings-dif.css";
import { COL_DIF } from "./standingsTableColumns";
import { computeStandingDif, formatStandingDif } from "../../utils/standingsDisplay";

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
  const pillMod =
    dif > 0 ? "te-pub-dif--pos" : dif < 0 ? "te-pub-dif--neg" : "te-pub-dif--zero";
  return (
    <td className={`${COL_DIF} ${className}`.trim()}>
      <span className={`te-pub-dif ${pillMod}`}>{formatStandingDif(dif)}</span>
    </td>
  );
};
