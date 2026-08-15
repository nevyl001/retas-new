import React from "react";
import type { CategoriaPublicCardStats } from "../../../lib/torneoExpress/categoriaPublicCardStats";

export type EventoCategoriaHubCardProps = {
  categoriaId: string;
  stats: CategoriaPublicCardStats;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** En el hub cada categoría abre directamente su vista pública de grupos. */
export const EventoCategoriaHubCard: React.FC<EventoCategoriaHubCardProps> = ({
  categoriaId,
  stats,
}) => {
  const gruposHref = `/torneo-express/${categoriaId}/grupos`;
  const estadoLabel =
    stats.estadoLabel === "Pendiente" ? "Próximo" : stats.estadoLabel;
  const progressPct =
    stats.progress01 == null
      ? null
      : Math.max(0, Math.min(100, Math.round(stats.progress01 * 100)));

  return (
    <article
      className="te-cat-hub"
      data-categoria-id={categoriaId}
    >
      <a
        className="te-cat-hub__face"
        href={gruposHref}
        aria-label={`Abrir categoría ${stats.title}`}
      >
        <div className="te-cat-hub__face-main">
          <div className="te-cat-hub__title-row">
            <h3 className="te-cat-hub__title">{stats.title}</h3>
            <span
              className={`te-cat-hub__estado te-cat-hub__estado--${estadoLabel
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
            >
              {estadoLabel}
            </span>
          </div>
          <p className="te-cat-hub__phase">{stats.phaseLabel}</p>
          <p className="te-cat-hub__meta">
            {plural(stats.parejaCount, "pareja", "parejas")}
            <span aria-hidden> · </span>
            {plural(stats.gruposCount, "grupo", "grupos")}
          </p>
          {stats.partidoTotal > 0 ? (
            <p className="te-cat-hub__progress-label">
              {stats.partidoJugados} / {stats.partidoTotal} partidos
            </p>
          ) : (
            <p className="te-cat-hub__progress-label te-cat-hub__progress-label--muted">
              Sin partidos programados
            </p>
          )}
          {progressPct != null ? (
            <div
              className="te-cat-hub__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              aria-label={`${progressPct}% de partidos jugados`}
            >
              <span
                className="te-cat-hub__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : null}
          <span className="te-cat-hub__action">
            Abrir categoría <span aria-hidden>→</span>
          </span>
        </div>
      </a>
    </article>
  );
};
