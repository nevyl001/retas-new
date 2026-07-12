import React, { useMemo } from "react";
import {
  simpleRankingToMobileRow,
  type SimpleRankingPresentationRow,
} from "../../lib/modePresentation/standingsRowAdapters";
import { StandingsMobileCards } from "../standings/StandingsMobileCards";
import "../../styles/standings-mobile-cards.css";

type LigaSimpleRankingColumn = {
  key: string;
  header: string;
  render: (row: SimpleRankingPresentationRow) => React.ReactNode;
};

export const LigaSimpleRankingDual: React.FC<{
  title: string;
  hint?: string;
  rows: SimpleRankingPresentationRow[];
  columns: LigaSimpleRankingColumn[];
  emptyMessage?: string;
  embedded?: boolean;
  topRowClassName?: (row: SimpleRankingPresentationRow) => string | undefined;
}> = ({
  title,
  hint,
  rows,
  columns,
  emptyMessage = "Sin resultados aún.",
  embedded = false,
  topRowClassName,
}) => {
  const mobileRows = useMemo(
    () => rows.map((row) => simpleRankingToMobileRow(row)),
    [rows]
  );

  const body =
    rows.length === 0 ? (
      <p className="liga-empty">{emptyMessage}</p>
    ) : (
      <>
        <div className="liga-ranking-mobile-cards">
          <StandingsMobileCards rows={mobileRows} />
        </div>
        <div className="liga-jornada-ranking-table-wrap liga-ranking-table-desktop">
          <table className="liga-ranking-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={topRowClassName?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key}>{col.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );

  if (embedded) {
    return <div className="liga-jornada-ranking-dual">{body}</div>;
  }

  return (
    <div className="liga-card liga-jornada-ranking-card">
      {title ? <h2 className="liga-card__title">{title}</h2> : null}
      {hint ? <p className="liga-hint">{hint}</p> : null}
      {body}
    </div>
  );
};
