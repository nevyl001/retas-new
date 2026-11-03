import React from "react";
import type { LigaPartido } from "../../../lib/liga/types";

export interface RoundSectionProps {
  ronda: number;
  partidos: LigaPartido[];
  statusLabel?: string;
  /** Resultados ya persistidos (completed) en esta ronda. */
  resultadosGuardados?: number;
  /** @deprecated Las rondas siempre se muestran abiertas. */
  defaultCollapsed?: boolean;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const RoundSection: React.FC<RoundSectionProps> = ({
  ronda,
  partidos,
  statusLabel,
  resultadosGuardados,
  footerActions,
  children,
}) => {
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

  return (
    <section
      className="jornada-round jornada-round--open"
      aria-labelledby={`jornada-ronda-${ronda}`}
    >
      <header className="jornada-round__head">
        <div className="jornada-round__titles">
          <h2 id={`jornada-ronda-${ronda}`} className="jornada-round__title">
            {title}
          </h2>
          <p className="jornada-round__meta">{meta}</p>
        </div>
      </header>
      <div
        id={`jornada-ronda-panel-${ronda}`}
        className="jornada-round__panel"
      >
        <div className="jornada-round__grid">{children}</div>
        {footerActions ? (
          <div className="jornada-round__footer">{footerActions}</div>
        ) : null}
      </div>
    </section>
  );
};
