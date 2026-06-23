import React from "react";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import { formatDueloHorarioRange } from "../../lib/duelo2v2/schedule";
import { formatCanchaDisplay } from "../../lib/torneoExpress/canchaDisplay";
import { formatPartidoFecha } from "../../lib/torneoExpress/partidoSchedule";

interface Duelo2v2MatchMetaProps {
  duelo: Pick<Duelo2v2, "cancha" | "programado_en" | "programado_hasta">;
  className?: string;
}

export const Duelo2v2MatchMeta: React.FC<Duelo2v2MatchMetaProps> = ({
  duelo,
  className = "",
}) => {
  const canchaLabel = formatCanchaDisplay(duelo.cancha);
  const scheduleIso = duelo.programado_en?.trim();
  const horarioLabel = formatDueloHorarioRange(
    duelo.programado_en,
    duelo.programado_hasta
  );

  return (
    <div
      className={`duelo2v2-match-meta${className ? ` ${className}` : ""}`}
      aria-label="Programación del encuentro"
    >
      {scheduleIso ? (
        <>
          <span className="duelo2v2-match-meta__chip">
            <span className="duelo2v2-match-meta__icon" aria-hidden>
              📅
            </span>
            {formatPartidoFecha(scheduleIso)}
          </span>
          {horarioLabel ? (
            <span className="duelo2v2-match-meta__chip">
              <span className="duelo2v2-match-meta__icon" aria-hidden>
                🕐
              </span>
              {horarioLabel}
            </span>
          ) : null}
        </>
      ) : null}
      <span className="duelo2v2-match-meta__chip">
        <span className="duelo2v2-match-meta__icon" aria-hidden>
          📍
        </span>
        {canchaLabel}
      </span>
    </div>
  );
};
