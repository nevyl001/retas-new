import React, { useId } from "react";
import type { CategoriaPublicCardStats } from "../../../lib/torneoExpress/categoriaPublicCardStats";
import type { TorneoExpressEventoPublicoGrupo } from "../../../lib/torneoExpress/types";

export type EventoCategoriaHubCardProps = {
  categoriaId: string;
  stats: CategoriaPublicCardStats;
  grupos: TorneoExpressEventoPublicoGrupo[];
  open: boolean;
  onToggle: () => void;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Card + hub expandible de una categoría en la vista pública del Evento.
 * Navegación consistente: el click siempre abre el hub (nunca salta por fase).
 * Sin ítem "Partidos" — partidos viven en /grupos (evita redundancia).
 */
export const EventoCategoriaHubCard: React.FC<EventoCategoriaHubCardProps> = ({
  categoriaId,
  stats,
  grupos,
  open,
  onToggle,
}) => {
  const panelId = useId();
  const gruposHref = `/torneo-express/${categoriaId}/grupos`;
  const generalHref = `/torneo-express/${categoriaId}/general`;
  const elimHref = `/torneo-express/${categoriaId}/eliminatoria`;
  const progressPct =
    stats.progress01 == null
      ? null
      : Math.max(0, Math.min(100, Math.round(stats.progress01 * 100)));

  return (
    <article
      className={`te-cat-hub${open ? " te-cat-hub--open" : ""}`}
      data-categoria-id={categoriaId}
    >
      <button
        type="button"
        className="te-cat-hub__face"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="te-cat-hub__face-main">
          <div className="te-cat-hub__title-row">
            <h3 className="te-cat-hub__title">{stats.title}</h3>
            <span
              className={`te-cat-hub__estado te-cat-hub__estado--${stats.estadoLabel
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
            >
              {stats.estadoLabel}
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
              {stats.partidoJugados} / {stats.partidoTotal} partidos jugados
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
        </div>
        <span className="te-cat-hub__chevron" aria-hidden>
          ›
        </span>
      </button>

      <div
        id={panelId}
        className="te-cat-hub__panel"
        hidden={!open}
      >
        <nav className="te-cat-hub__nav" aria-label={`Navegación de ${stats.title}`}>
          <a
            className={`te-cat-hub__link${
              stats.hasGrupos ? "" : " te-cat-hub__link--disabled"
            }`}
            href={stats.hasGrupos ? generalHref : undefined}
            aria-disabled={!stats.hasGrupos}
            onClick={(e) => {
              if (!stats.hasGrupos) e.preventDefault();
            }}
          >
            <span className="te-cat-hub__link-label">Resumen</span>
            <span className="te-cat-hub__link-hint">Tabla general</span>
          </a>

          <div className="te-cat-hub__group">
            <p className="te-cat-hub__group-label">Grupos</p>
            {stats.hasGrupos ? (
              <ul className="te-cat-hub__group-list">
                {grupos.map((g) => (
                  <li key={g.id}>
                    <a
                      className="te-cat-hub__sublink"
                      href={`/torneo-express/${categoriaId}/grupo/${g.id}`}
                    >
                      {g.nombre?.trim() || "Grupo"}
                    </a>
                  </li>
                ))}
                <li>
                  <a className="te-cat-hub__sublink te-cat-hub__sublink--all" href={gruposHref}>
                    Ver todos
                  </a>
                </li>
              </ul>
            ) : (
              <p className="te-cat-hub__empty">Aún no hay grupos</p>
            )}
          </div>

          {stats.hasEliminatoria ? (
            <a className="te-cat-hub__link" href={elimHref}>
              <span className="te-cat-hub__link-label">Eliminatoria</span>
              <span className="te-cat-hub__link-hint">Fase final</span>
            </a>
          ) : (
            <div
              className="te-cat-hub__link te-cat-hub__link--disabled"
              aria-disabled="true"
            >
              <span className="te-cat-hub__link-label">Eliminatoria</span>
              <span className="te-cat-hub__link-hint">Aún no disponible</span>
            </div>
          )}
        </nav>
      </div>
    </article>
  );
};
