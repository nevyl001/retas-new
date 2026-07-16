import React from "react";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import { resolveDueloLugarForShare } from "../../lib/duelo2v2/dueloLugarPrefs";
import { formatDueloHorarioRange } from "../../lib/duelo2v2/schedule";
import { formatCanchaDisplay } from "../../lib/torneoExpress/canchaDisplay";
import { formatPartidoFecha } from "../../lib/torneoExpress/partidoSchedule";

interface Duelo2v2MatchMetaProps {
  duelo: Pick<
    Duelo2v2,
    | "id"
    | "cancha"
    | "programado_en"
    | "programado_hasta"
    | "lugar"
    | "mostrar_lugar"
  >;
  /** Nombre del club/comunidad como fallback de sede. */
  clubName?: string;
  className?: string;
  align?: "center" | "start";
}

export const Duelo2v2MatchMeta: React.FC<Duelo2v2MatchMetaProps> = ({
  duelo,
  clubName = "",
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
  const { lugar, includeLugar } = resolveDueloLugarForShare(duelo, clubName);
  const lugarLabel = includeLugar && lugar ? lugar : null;

  const alignClass =
    align === "start"
      ? "duelo2v2-match-meta--align-start"
      : "duelo2v2-match-meta--align-center";
  const cardClass = lugarLabel
    ? "duelo2v2-match-meta__card duelo2v2-match-meta__card--with-lugar"
    : "duelo2v2-match-meta__card";

  return (
    <div
      className={`duelo2v2-match-meta ${alignClass}${className ? ` ${className}` : ""}`}
      aria-label="Programación del encuentro"
    >
      <div className={cardClass}>
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

        {lugarLabel ? (
          <div className="duelo2v2-match-meta__item duelo2v2-match-meta__item--lugar">
            <span className="duelo2v2-match-meta__kicker">Lugar</span>
            <span className="duelo2v2-match-meta__value">{lugarLabel}</span>
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
