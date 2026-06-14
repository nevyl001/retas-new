import React from "react";
import { formatCanchaDisplay } from "../../../lib/torneoExpress/canchaDisplay";
import {
  formatPartidoFecha,
  formatPartidoHora,
  partidoScheduleIso,
} from "../../../lib/torneoExpress/partidoSchedule";
import type { TorneoExpressPartido } from "../../../lib/torneoExpress/types";

export const TePublicMatchMeta: React.FC<{ partido: TorneoExpressPartido }> = ({
  partido,
}) => {
  const scheduleIso = partidoScheduleIso(partido);
  const fechaLabel = formatPartidoFecha(scheduleIso);
  const horaLabel = formatPartidoHora(scheduleIso);
  const canchaLabel = formatCanchaDisplay(partido.cancha);

  return (
    <div className="te-pub-match__meta" aria-label="Programación del partido">
      <span className="te-pub-match-chip te-pub-match-chip--fecha">
        <span className="te-pub-match-chip__icon" aria-hidden>
          📅
        </span>
        {fechaLabel}
      </span>
      <span className="te-pub-match-chip te-pub-match-chip--hora">
        <span className="te-pub-match-chip__icon" aria-hidden>
          🕐
        </span>
        {horaLabel}
      </span>
      <span className="te-pub-match-chip te-pub-match-chip--cancha">
        <span className="te-pub-match-chip__icon" aria-hidden>
          📍
        </span>
        {canchaLabel}
      </span>
    </div>
  );
};
