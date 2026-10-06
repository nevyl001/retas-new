import React, { useEffect } from "react";
import {
  addDaysToMexicoCalendarDate,
  todayMexicoDateInput,
} from "../../lib/torneoExpress/teScheduleTime";
import type { TeScheduleDayWindow } from "../../lib/torneoExpress/scheduleDayWindows";
import {
  defaultScheduleDay,
  MAX_DAY_COURTS,
  resizeDayCourts,
} from "../../lib/torneoExpress/scheduleDayWindows";
import { Button } from "../ui";

type TeScheduleDaysEditorProps = {
  days: TeScheduleDayWindow[];
  disabled?: boolean;
  idPrefix?: string;
  onChange: (days: TeScheduleDayWindow[]) => void;
};

export const TeScheduleDaysEditor: React.FC<TeScheduleDaysEditorProps> = ({
  days,
  disabled = false,
  idPrefix = "te-day",
  onChange,
}) => {
  const updateDay = (
    index: number,
    patch: Partial<TeScheduleDayWindow>
  ) => {
    onChange(
      days.map((day, i) => (i === index ? { ...day, ...patch } : day))
    );
  };

  const removeDay = (index: number) => {
    if (days.length <= 1) return;
    onChange(days.filter((_, i) => i !== index));
  };

  const addDay = () => {
    const last = days[days.length - 1] ?? defaultScheduleDay();
    const nextDate =
      addDaysToMexicoCalendarDate(last.date, 1) ?? todayMexicoDateInput();
    onChange([
      ...days,
      {
        date: nextDate,
        startTime: last.startTime,
        endTime: last.endTime,
        courts: [...(last.courts ?? resizeDayCourts(undefined, 2))],
      },
    ]);
  };

  const updateDayCourts = (index: number, courts: string[]) => {
    updateDay(index, { courts });
  };

  const missingCourts = days.some(
    (day) => !Array.isArray(day.courts) || day.courts.length === 0
  );

  useEffect(() => {
    if (!missingCourts) return;
    onChange(
      days.map((day) =>
        Array.isArray(day.courts) && day.courts.length > 0
          ? day
          : { ...day, courts: resizeDayCourts(day.courts, 2) }
      )
    );
  }, [missingCourts, days, onChange]);

  return (
    <div className="te-schedule-days">
      <div className="te-schedule-days__list">
        {days.map((day, index) => (
          <div
            key={`${idPrefix}-${index}`}
            className="te-schedule-days__row"
          >
            <div className="te-schedule-days__row-head">
              <strong>Día {index + 1}</strong>
              {days.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => removeDay(index)}
                >
                  Quitar
                </Button>
              ) : null}
            </div>
            <div className="te-schedule-days__fields">
              <div className="torneo-express-field te-schedule-days__field--date">
                <label htmlFor={`${idPrefix}-date-${index}`}>Fecha</label>
                <input
                  id={`${idPrefix}-date-${index}`}
                  type="date"
                  value={day.date}
                  disabled={disabled}
                  onChange={(e) => updateDay(index, { date: e.target.value })}
                />
              </div>
              <div className="torneo-express-field">
                <label htmlFor={`${idPrefix}-start-${index}`}>
                  Hora de apertura
                </label>
                <input
                  id={`${idPrefix}-start-${index}`}
                  type="time"
                  value={day.startTime}
                  disabled={disabled}
                  onChange={(e) =>
                    updateDay(index, { startTime: e.target.value })
                  }
                />
              </div>
              <div className="torneo-express-field">
                <label htmlFor={`${idPrefix}-end-${index}`}>
                  Hora de cierre
                </label>
                <input
                  id={`${idPrefix}-end-${index}`}
                  type="time"
                  value={day.endTime}
                  disabled={disabled}
                  onChange={(e) =>
                    updateDay(index, { endTime: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="te-schedule-days__courts">
              <div className="torneo-express-field te-schedule-days__court-count">
                <label htmlFor={`${idPrefix}-courts-${index}`}>
                  Canchas este día
                </label>
                <input
                  id={`${idPrefix}-courts-${index}`}
                  type="number"
                  min={1}
                  max={MAX_DAY_COURTS}
                  step={1}
                  value={(day.courts ?? resizeDayCourts(undefined, 2)).length}
                  disabled={disabled}
                  onChange={(e) =>
                    updateDayCourts(
                      index,
                      resizeDayCourts(day.courts, Number(e.target.value))
                    )
                  }
                />
              </div>
              <div className="te-schedule-days__court-names">
                {(day.courts ?? resizeDayCourts(undefined, 2)).map(
                  (courtName, courtIndex) => (
                    <div
                      key={`${idPrefix}-court-${index}-${courtIndex}`}
                      className="torneo-express-field"
                    >
                      <label
                        htmlFor={`${idPrefix}-court-name-${index}-${courtIndex}`}
                      >
                        Cancha {courtIndex + 1}
                      </label>
                      <input
                        id={`${idPrefix}-court-name-${index}-${courtIndex}`}
                        type="text"
                        value={courtName}
                        disabled={disabled}
                        placeholder={`Cancha ${courtIndex + 1}`}
                        onChange={(e) => {
                          const next = [
                            ...(day.courts ?? resizeDayCourts(undefined, 2)),
                          ];
                          next[courtIndex] = e.target.value;
                          updateDayCourts(index, next);
                        }}
                      />
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || days.length >= 14}
        onClick={addDay}
      >
        Agregar día
      </Button>
    </div>
  );
};
