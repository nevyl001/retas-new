import React from "react";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import { formatDueloHorarioRange } from "../../lib/duelo2v2/schedule";
import { formatCanchaDisplay } from "../../lib/torneoExpress/canchaDisplay";
import { formatPartidoFecha } from "../../lib/torneoExpress/partidoSchedule";

interface Duelo2v2MatchMetaProps {
  duelo: Pick<Duelo2v2, "cancha" | "programado_en" | "programado_hasta">;
  className?: string;
  align?: "center" | "start";
}

export const Duelo2v2MatchMeta: React.FC<Duelo2v2MatchMetaProps> = ({
  duelo,
  className = "",
  align = "center",
}) => {
  const canchaLabel = formatCanchaDisplay(duelo.cancha);
  const scheduleIso = duelo.programado_en?.trim();
  const fechaLabel = scheduleIso ? formatPartidoFecha(scheduleIso) : null;
  const horarioLabel = formatDueloHorarioRange(
    duelo.programado_en,
    duelo.programado_hasta
  );

  const alignClass =
    align === "start" ? "duelo2v2-match-meta--align-start" : "duelo2v2-match-meta--align-center";

  return (
    <div
      className={`duelo2v2-match-meta ${alignClass}${className ? ` ${className}` : ""}`}
      aria-label="Programación del encuentro"
    >
      <div className="duelo2v2-match-meta__card">
        {fechaLabel ? (
          <div className="duelo2v2-match-meta__item duelo2v2-match-meta__item--fecha">
            <span className="duelo2v2-match-meta__kicker">Fecha</span>
            <span className="duelo2v2-match-meta__value">{fechaLabel}</span>
          </div>
        ) : null}

        {horarioLabel ? (
          <div className="duelo2v2-match-meta__item duelo2v2-match-meta__item--horario">
            <span className="duelo2v2-match-meta__kicker">Horario</span>
            <span className="duelo2v2-match-meta__value duelo2v2-match-meta__value--accent">
              {horarioLabel}
            </span>
          </div>
        ) : null}

        <div className="duelo2v2-match-meta__item duelo2v2-match-meta__item--cancha">
          <span className="duelo2v2-match-meta__kicker">Cancha</span>
          <span className="duelo2v2-match-meta__value duelo2v2-match-meta__value--court">
            {canchaLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
