import React from "react";

export interface JornadaScheduleToolbarProps {
  fecha: string;
  hora: string;
  showBulkHorario: boolean;
  disabled?: boolean;
  busy?: boolean;
  onFechaChange: (fecha: string) => void;
  onHoraChange: (hora: string) => void;
  onSaveFecha: () => void;
  onApplyHorario: () => void;
}

export const JornadaScheduleToolbar: React.FC<JornadaScheduleToolbarProps> = ({
  fecha,
  hora,
  showBulkHorario,
  disabled,
  busy,
  onFechaChange,
  onHoraChange,
  onSaveFecha,
  onApplyHorario,
}) => (
  <section className="jornada-schedule-toolbar" aria-label="Programación de la jornada">
    <span className="jornada-schedule-toolbar__label">Programación</span>
    <label className="jornada-schedule-toolbar__field" htmlFor="jornada-schedule-fecha">
      <span className="jornada-schedule-toolbar__field-label">Fecha</span>
      <input
        id="jornada-schedule-fecha"
        name="jornada-schedule-fecha"
        type="date"
        value={fecha}
        disabled={disabled || busy}
        onChange={(event) => onFechaChange(event.target.value)}
        aria-label="Fecha de la jornada"
      />
    </label>
    {showBulkHorario ? (
      <label className="jornada-schedule-toolbar__field" htmlFor="jornada-schedule-hora">
        <span className="jornada-schedule-toolbar__field-label">Inicio</span>
        <input
          id="jornada-schedule-hora"
          name="jornada-schedule-hora"
          type="time"
          value={hora}
          disabled={disabled || busy}
          onChange={(event) => onHoraChange(event.target.value)}
          aria-label="Hora de inicio de la jornada"
        />
      </label>
    ) : null}
    <button
      type="button"
      className="jornada-schedule-toolbar__btn"
      disabled={disabled || busy}
      onClick={onSaveFecha}
    >
      Guardar fecha
    </button>
    {showBulkHorario ? (
      <button
        type="button"
        className="jornada-schedule-toolbar__btn jornada-schedule-toolbar__btn--accent"
        disabled={disabled || busy}
        onClick={onApplyHorario}
      >
        Guardar inicio
      </button>
    ) : null}
  </section>
);
