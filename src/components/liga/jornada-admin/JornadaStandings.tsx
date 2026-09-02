import React from "react";
import type { SimpleRankingPresentationRow } from "../../../lib/modePresentation/standingsRowAdapters";

export type JornadaStandingsColumn = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  render: (row: SimpleRankingPresentationRow) => React.ReactNode;
  emphasis?: boolean;
};

export interface JornadaStandingsProps {
  title: string;
  hint?: string;
  rows: SimpleRankingPresentationRow[];
  columns: JornadaStandingsColumn[];
  emptyMessage?: string;
  sectionId?: string;
}

export const JornadaStandings: React.FC<JornadaStandingsProps> = ({
  title,
  hint,
  rows,
  columns,
  emptyMessage = "Sin puntos en la liga aún.",
  sectionId,
}) => {
  const headingId =
    sectionId ??
    `jornada-standings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
  <section className="jornada-standings" aria-labelledby={headingId}>
    <header className="jornada-standings__head">
      <h2 id={headingId} className="jornada-standings__title">
        {title}
      </h2>
      {hint ? <p className="jornada-standings__hint">{hint}</p> : null}
    </header>
    {rows.length === 0 ? (
      <p className="jornada-standings__empty">{emptyMessage}</p>
    ) : (
      <div className="jornada-standings__wrap">
        <table className="jornada-standings__table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    col.align ? `jornada-standings__cell--${col.align}` : "",
                    col.emphasis ? "jornada-standings__cell--pts-head" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={
                  row.position <= 3 ? "jornada-standings__row--top" : undefined
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      col.align ? `jornada-standings__cell--${col.align}` : "",
                      col.emphasis ? "jornada-standings__cell--pts" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
  );
};
