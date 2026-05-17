import React from "react";
import { COL_PTS } from "./standingsTableColumns";
import { STANDINGS_PTS_TABLE_TITLE } from "./standingsTableConfig";

interface StandingsPtsCellProps {
  pts: number;
  className?: string;
}

export const StandingsPtsCell: React.FC<StandingsPtsCellProps> = ({
  pts,
  className = "new-points-cell",
}) => (
  <td className={`${COL_PTS} ${className}`.trim()} title={STANDINGS_PTS_TABLE_TITLE}>
    {pts}
  </td>
);
