import React, { useEffect, useState } from "react";
import type { LigaPartido } from "../../../lib/liga/types";

export interface RoundSectionProps {
  ronda: number;
  partidos: LigaPartido[];
  statusLabel?: string;
  /** Resultados ya persistidos (completed) en esta ronda. */
  resultadosGuardados?: number;
  /** Si true, la ronda inicia contraída (el grid permanece montado). */
  defaultCollapsed?: boolean;
  rondaHorario?: React.ReactNode;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const RoundSection: React.FC<RoundSectionProps> = ({
  ronda,
  partidos,
  statusLabel,
  resultadosGuardados,
  defaultCollapsed = false,
  rondaHorario,
  footerActions,
  children,
}) => {
  const [open, setOpen] = useState(!defaultCollapsed);
  const saved =
    resultadosGuardados ??
    partidos.filter((p) => p.estado === "completed").length;
  const total = partidos.length;

  useEffect(() => {
    if (!defaultCollapsed) setOpen(true);
  }, [defaultCollapsed]);

  const metaParts = [
    `${total} partido${total === 1 ? "" : "s"}`,
    `${saved} de ${total} resultados`,
  ];

  return (
    <section
      className={`jornada-round${open ? " jornada-round--open" : " jornada-round--collapsed"}`}
      aria-labelledby={`jornada-ronda-${ronda}`}
    >
      <header className="jornada-round__head">
        <div className="jornada-round__titles">
          <button
            type="button"
            className="jornada-round__toggle"
            aria-expanded={open}
            aria-controls={`jornada-ronda-panel-${ronda}`}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="jornada-round__chevron" aria-hidden>
              {open ? "▾" : "▸"}
            </span>
            <h2 id={`jornada-ronda-${ronda}`} className="jornada-round__title">
              Ronda {ronda}
            </h2>
          </button>
          <p className="jornada-round__meta">{metaParts.join(" · ")}</p>
        </div>
        <div className="jornada-round__tools">
          {statusLabel ? (
            <span className="jornada-round__status">{statusLabel}</span>
          ) : null}
          {rondaHorario}
        </div>
      </header>
      <div
        id={`jornada-ronda-panel-${ronda}`}
        className="jornada-round__panel"
        hidden={!open}
      >
        <div className="jornada-round__grid">{children}</div>
        {footerActions ? (
          <div className="jornada-round__footer">{footerActions}</div>
        ) : null}
      </div>
    </section>
  );
};
