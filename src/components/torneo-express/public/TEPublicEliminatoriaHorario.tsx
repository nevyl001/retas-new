import React from "react";
import type { EliminatoriaPossibleSlot } from "../../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import {
  formatEliminatoriaCourtsLabel,
  formatEliminatoriaSlotTime,
} from "../../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import "./te-public-eliminatoria-v2.css";

export const TEPublicEliminatoriaHorario: React.FC<{
  slots: EliminatoriaPossibleSlot[];
  timeZone?: string | null;
  currentTorneoId?: string;
}> = ({ slots, timeZone, currentTorneoId }) => {
  if (slots.length === 0) return null;
  return (
    <section
      className="te-elim-horario"
      aria-label="Horarios posibles de eliminatoria"
    >
      <h2 className="te-elim-horario__title">Horarios posibles</h2>
      <p className="te-elim-horario__hint">
        Hora, orden y canchas los define el organizador en el evento.
      </p>
      <ol className="te-elim-horario__list">
        {slots.map((slot, index) => {
          const current = slot.torneoId === currentTorneoId;
          const courtsLabel = formatEliminatoriaCourtsLabel(slot.courts);
          const body = (
            <>
              <span className="te-elim-horario__index">{index + 1}</span>
              <span className="te-elim-horario__copy">
                <span className="te-elim-horario__name">{slot.label}</span>
                {courtsLabel ? (
                  <span className="te-elim-horario__courts">{courtsLabel}</span>
                ) : null}
              </span>
              <time className="te-elim-horario__time">
                {formatEliminatoriaSlotTime(slot.startsAt, timeZone)}
              </time>
            </>
          );
          return (
            <li key={slot.torneoId}>
              {current ? (
                <span
                  className="te-elim-horario__row te-elim-horario__row--current"
                  aria-current="page"
                >
                  {body}
                </span>
              ) : (
                <a className="te-elim-horario__row" href={slot.href}>
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
