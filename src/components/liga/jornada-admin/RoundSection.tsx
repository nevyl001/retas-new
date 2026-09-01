import React from "react";
import type { LigaPartido } from "../../../lib/liga/types";
import { rondaHoraLabel } from "./jornadaAdminUtils";

export interface RoundSectionProps {
  ronda: number;
  partidos: LigaPartido[];
  statusLabel?: string;
  rondaHorario?: React.ReactNode;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const RoundSection: React.FC<RoundSectionProps> = ({
  ronda,
  partidos,
  statusLabel,
  rondaHorario,
  footerActions,
  children,
}) => {
  const hora = rondaHoraLabel(partidos);
  const metaParts: string[] = [];
  if (hora) metaParts.push(hora);
  metaParts.push(
    `${partidos.length} partido${partidos.length === 1 ? "" : "s"}`
  );

  return (
    <section className="jornada-round" aria-labelledby={`jornada-ronda-${ronda}`}>
      <header className="jornada-round__head">
        <div className="jornada-round__titles">
          <h2 id={`jornada-ronda-${ronda}`} className="jornada-round__title">
            Ronda {ronda}
          </h2>
          <p className="jornada-round__meta">{metaParts.join(" · ")}</p>
        </div>
        <div className="jornada-round__tools">
          {statusLabel ? (
            <span className="jornada-round__status">{statusLabel}</span>
          ) : null}
          {rondaHorario}
        </div>
      </header>
      <div className="jornada-round__grid">{children}</div>
      {footerActions ? (
        <div className="jornada-round__footer">{footerActions}</div>
      ) : null}
    </section>
  );
};
