import React, { useMemo, useState } from "react";
import {
  dayOfMonthFromFecha,
  monthNameLongEs,
  participacionTipoEventoLabel,
  type ParticipacionDetalleRow,
  type YearMonth,
} from "../../lib/rivieraJugadores/participacionesMensuales";

interface ParticipacionesActivityCalendarProps {
  ym: YearMonth;
  detalle: ParticipacionDetalleRow[];
}

const WEEKDAY_HEADERS_ES = ["L", "M", "M", "J", "V", "S", "D"];

/** Días del mes calendario (fecha es un `date` de Postgres, no un instante -- sin conversión TZ). */
function daysInMonth(ym: YearMonth): number {
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
}

/** 0 = lunes .. 6 = domingo, del día 1 del mes. */
function firstWeekdayIndexMondayFirst(ym: YearMonth): number {
  const jsSundayFirst = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay();
  return (jsSundayFirst + 6) % 7;
}

/**
 * Calendario de actividad mensual, complementario al listado cronológico
 * (nunca lo sustituye -- ver overlay de detalle). Un punto = 1+ participación
 * ese día calendario. Click/tap muestra los eventos de ese día debajo del
 * grid -- funciona igual con mouse y con dedo.
 */
export const ParticipacionesActivityCalendar: React.FC<
  ParticipacionesActivityCalendarProps
> = ({ ym, detalle }) => {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<number, ParticipacionDetalleRow[]>();
    for (const row of detalle) {
      const day = dayOfMonthFromFecha(row.fecha);
      if (day == null) continue;
      const list = map.get(day) ?? [];
      list.push(row);
      map.set(day, list);
    }
    return map;
  }, [detalle]);

  const totalDays = daysInMonth(ym);
  const leading = firstWeekdayIndexMondayFirst(ym);
  const cells: Array<number | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const selectedEvents = selectedDay != null ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div
      className="rjp-part-cal"
      aria-label={`Calendario de actividad de ${monthNameLongEs(ym.month)} ${ym.year}`}
    >
      <div className="rjp-part-cal__weekdays" aria-hidden>
        {WEEKDAY_HEADERS_ES.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="rjp-part-cal__grid">
        {cells.map((day, idx) => {
          if (day == null) {
            return (
              <span
                key={`blank-${idx}`}
                className="rjp-part-cal__cell rjp-part-cal__cell--empty"
                aria-hidden
              />
            );
          }
          const events = byDay.get(day) ?? [];
          const hasActivity = events.length > 0;
          const isSelected = selectedDay === day;
          return (
            <button
              key={day}
              type="button"
              className={`rjp-part-cal__cell${
                hasActivity ? " rjp-part-cal__cell--active" : ""
              }${isSelected ? " rjp-part-cal__cell--selected" : ""}`}
              disabled={!hasActivity}
              aria-pressed={hasActivity ? isSelected : undefined}
              aria-label={
                hasActivity
                  ? `${day}: ${events.length} ${
                      events.length === 1 ? "participación" : "participaciones"
                    }`
                  : `${day}: sin participaciones`
              }
              onClick={() => setSelectedDay(isSelected ? null : day)}
            >
              <span className="rjp-part-cal__day">{day}</span>
              {hasActivity ? <span className="rjp-part-cal__dot" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      {selectedDay != null ? (
        <div className="rjp-part-cal__detail" role="status">
          <p className="rjp-part-cal__detail-title">
            {selectedDay} de {monthNameLongEs(ym.month)}
            {selectedEvents.length > 1 ? ` · ${selectedEvents.length} participaciones` : ""}
          </p>
          <ul className="rjp-part-cal__detail-list">
            {selectedEvents.map((ev) => (
              <li key={ev.participacion_id}>
                <span className="rjp-part-cal__detail-evento">
                  {ev.evento_nombre?.trim() || participacionTipoEventoLabel(ev.tipo_evento)}
                </span>
                <span className="rjp-part-cal__detail-tipo">
                  {participacionTipoEventoLabel(ev.tipo_evento)}
                </span>
                <span className="rjp-part-cal__detail-pts">+{ev.puntos_obtenidos} pts</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
