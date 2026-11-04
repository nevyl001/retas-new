import React, { useId, useState } from "react";
import type { LigaPartido } from "../../../lib/liga/types";

export type RoundSectionTone = "active" | "pending" | "complete";

export interface RoundSectionProps {
  ronda: number;
  partidos: LigaPartido[];
  statusLabel?: string;
  /** Resultados ya persistidos (completed) en esta ronda. */
  resultadosGuardados?: number;
  /**
   * Si true, la ronda inicia colapsada (expandible).
   * Ronda activa conviene abierta; pendientes/completadas suelen ir colapsadas.
   */
  defaultCollapsed?: boolean;
  /** Jerarquía visual: activa vs pendiente vs completada. */
  tone?: RoundSectionTone;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const RoundSection: React.FC<RoundSectionProps> = ({
  ronda,
  partidos,
  statusLabel,
  resultadosGuardados,
  defaultCollapsed = false,
  tone,
  footerActions,
  children,
}) => {
  const [open, setOpen] = useState(!defaultCollapsed);
  const panelId = useId();
  const saved =
    resultadosGuardados ??
    partidos.filter((p) => p.estado === "completed").length;
  const total = partidos.length;
  const canchas = new Set(
    partidos
      .map((p) => p.cancha)
      .filter((c): c is number => typeof c === "number" && c > 0)
  ).size;
  const canchasLabel = canchas > 0 ? canchas : total;

  const title = statusLabel
    ? `Ronda ${ronda} — ${statusLabel}`
    : `Ronda ${ronda}`;
  const meta = `${total} partido${total === 1 ? "" : "s"} · ${canchasLabel} cancha${
    canchasLabel === 1 ? "" : "s"
  } · ${saved} de ${total} resultados guardados`;

  const toneClass =
    tone === "active"
      ? " jornada-round--active"
      : tone === "pending"
        ? " jornada-round--pending"
        : tone === "complete"
          ? " jornada-round--complete"
          : "";

  return (
    <section
      className={`jornada-round${open ? " jornada-round--open" : " jornada-round--collapsed"}${toneClass}`}
      aria-labelledby={`jornada-ronda-${ronda}`}
    >
      <header className="jornada-round__head">
        <button
          type="button"
          className="jornada-round__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <div className="jornada-round__titles">
            <h2 id={`jornada-ronda-${ronda}`} className="jornada-round__title">
              {title}
            </h2>
            <p className="jornada-round__meta">{meta}</p>
          </div>
          <span className="jornada-round__chevron" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
      </header>
      <div
        id={panelId}
        className="jornada-round__panel"
        hidden={!open}
      >
        <div className="jornada-round__grid">{children}</div>
        {footerActions ? (
          <div className="jornada-round__footer">{footerActions}</div>
        ) : null}
      </div>
      {!open && footerActions ? (
        <div className="jornada-round__footer jornada-round__footer--collapsed">
          {footerActions}
        </div>
      ) : null}
    </section>
  );
};
