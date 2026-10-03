import React from "react";
import {
  addDaysToMexicoCalendarDate,
  todayMexicoDateInput,
} from "../../lib/torneoExpress/teScheduleTime";
import type { TeScheduleDayWindow } from "../../lib/torneoExpress/scheduleDayWindows";
import { defaultScheduleDay } from "../../lib/torneoExpress/scheduleDayWindows";
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
      },
    ]);
  };

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
              <div className="torneo-express-field">
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
