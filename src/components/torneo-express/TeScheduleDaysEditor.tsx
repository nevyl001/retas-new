import React, { useEffect } from "react";
import {
  addDaysToMexicoCalendarDate,
  todayMexicoDateInput,
} from "../../lib/torneoExpress/teScheduleTime";
import type {
  TeScheduleCourtWindow,
  TeScheduleDayWindow,
} from "../../lib/torneoExpress/scheduleDayWindows";
import {
  courtWindowsForScheduleDay,
  dayWithCourtWindows,
  defaultScheduleDay,
  MAX_DAY_COURTS,
  resizeDayCourtWindows,
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
    const copied = courtWindowsForScheduleDay(last);
    onChange([
      ...days,
      dayWithCourtWindows(
        {
          date: nextDate,
          startTime: last.startTime,
          endTime: last.endTime,
        },
        copied.length > 0
          ? copied
          : courtWindowsForScheduleDay(resizeDayCourtWindows(last, 2))
      ),
    ]);
  };

  const setCourtWindows = (
    index: number,
    windows: TeScheduleCourtWindow[]
  ) => {
    const day = days[index];
    if (!day) return;
    updateDay(index, dayWithCourtWindows(day, windows));
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
          : resizeDayCourtWindows(day, 2)
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
                  value={courtWindowsForScheduleDay(day).length}
                  disabled={disabled}
                  onChange={(e) =>
                    updateDay(
                      index,
                      resizeDayCourtWindows(day, Number(e.target.value))
                    )
                  }
                />
              </div>
              <div className="te-schedule-days__court-names">
                {courtWindowsForScheduleDay(day).map((court, courtIndex) => (
                  <div
                    key={`${idPrefix}-court-${index}-${courtIndex}`}
                    className="te-schedule-days__court"
                  >
                    <div className="torneo-express-field">
                      <label
                        htmlFor={`${idPrefix}-court-name-${index}-${courtIndex}`}
                      >
                        Cancha {courtIndex + 1}
                      </label>
                      <input
                        id={`${idPrefix}-court-name-${index}-${courtIndex}`}
                        type="text"
                        value={court.name}
                        disabled={disabled}
                        placeholder={`Cancha ${courtIndex + 1}`}
                        onChange={(e) => {
                          const next = courtWindowsForScheduleDay(day);
                          next[courtIndex] = {
                            ...court,
                            name: e.target.value,
                          };
                          setCourtWindows(index, next);
                        }}
                      />
                    </div>
                    <div className="te-schedule-days__court-times">
                      <div className="torneo-express-field">
                        <label
                          htmlFor={`${idPrefix}-court-start-${index}-${courtIndex}`}
                        >
                          Disponible desde
                        </label>
                        <input
                          id={`${idPrefix}-court-start-${index}-${courtIndex}`}
                          type="time"
                          value={court.startTime}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = courtWindowsForScheduleDay(day);
                            next[courtIndex] = {
                              ...court,
                              startTime: e.target.value,
                            };
                            setCourtWindows(index, next);
                          }}
                        />
                      </div>
                      <div className="torneo-express-field">
                        <label
                          htmlFor={`${idPrefix}-court-end-${index}-${courtIndex}`}
                        >
                          Disponible hasta
                        </label>
                        <input
                          id={`${idPrefix}-court-end-${index}-${courtIndex}`}
                          type="time"
                          value={court.endTime}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = courtWindowsForScheduleDay(day);
                            next[courtIndex] = {
                              ...court,
                              endTime: e.target.value,
                            };
                            setCourtWindows(index, next);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
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
