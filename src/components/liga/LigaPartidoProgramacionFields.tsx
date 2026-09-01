import React, { useState } from "react";
import {
  dateInputValue,
  timeInputValue,
} from "../../lib/liga/programacion";
import type { LigaPartido } from "../../lib/liga/types";
import { Button } from "../ui";

export type PartidoProgramacionDraft = {
  cancha: string;
  hora: string;
};

export function getProgramacionDraftForPartido(
  partido: LigaPartido,
  drafts: Record<string, PartidoProgramacionDraft>
): PartidoProgramacionDraft {
  return (
    drafts[partido.id] ?? {
      cancha: partido.cancha != null ? String(partido.cancha) : "",
      hora: timeInputValue(partido.hora_inicio),
    }
  );
}

interface LigaPartidoProgramacionFieldsProps {
  partido: LigaPartido;
  draft: PartidoProgramacionDraft;
  canchasDisponibles: number;
  disabled?: boolean;
  busy?: boolean;
  /** Resumen legible + botón Editar; formulario solo al editar. */
  summaryMode?: boolean;
  /** Oculta "Sin horario" y reduce padding en captura. */
  compactSummary?: boolean;
  onChange: (next: PartidoProgramacionDraft) => void;
  onSave: () => void;
}

export const LigaPartidoProgramacionFields: React.FC<
  LigaPartidoProgramacionFieldsProps
> = ({
  partido,
  draft,
  canchasDisponibles,
  disabled,
  busy,
  summaryMode = false,
  compactSummary = false,
  onChange,
  onSave,
}) => {
  const [editing, setEditing] = useState(!summaryMode);
  const canchaOptions = Array.from(
    { length: Math.max(1, canchasDisponibles) },
    (_, i) => i + 1
  );

  const canchaText =
    draft.cancha.trim() !== ""
      ? `Cancha ${draft.cancha}`
      : partido.cancha != null
        ? `Cancha ${partido.cancha}`
        : "Cancha sin asignar";
  const horaText =
    draft.hora.trim() !== ""
      ? draft.hora
      : partido.hora_inicio
        ? timeInputValue(partido.hora_inicio)
        : "";

  if (summaryMode && !editing) {
    const summaryParts = [canchaText];
    if (horaText) summaryParts.push(horaText);
    return (
      <div
        className={`liga-programacion-summary${
          compactSummary ? " liga-programacion-summary--compact" : ""
        }`}
      >
        <p className="liga-programacion-summary__text">
          {summaryParts.join(" · ")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>
      </div>
    );
  }

  return (
    <div className="liga-programacion-row">
      <label className="liga-programacion-field">
        <span className="liga-programacion-field__label">Cancha</span>
        <select
          id={`liga-partido-${partido.id}-cancha`}
          name={`liga-partido-${partido.id}-cancha`}
          value={draft.cancha}
          disabled={disabled || busy}
          onChange={(e) => onChange({ ...draft, cancha: e.target.value })}
          aria-label={`Cancha partido ${partido.id}`}
        >
          <option value="">—</option>
          {canchaOptions.map((n) => (
            <option key={n} value={String(n)}>
              Cancha {n}
            </option>
          ))}
        </select>
      </label>
      <label className="liga-programacion-field">
        <span className="liga-programacion-field__label">Horario</span>
        <input
          id={`liga-partido-${partido.id}-hora`}
          name={`liga-partido-${partido.id}-hora`}
          type="time"
          value={draft.hora}
          disabled={disabled || busy}
          onChange={(e) => onChange({ ...draft, hora: timeInputValue(e.target.value) })}
          aria-label={`Horario partido ${partido.id}`}
        />
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || busy}
        onClick={() => {
          onSave();
          if (summaryMode) setEditing(false);
        }}
      >
        Guardar cancha/hora
      </Button>
      {summaryMode ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          onClick={() => setEditing(false)}
        >
          Cancelar
        </Button>
      ) : null}
    </div>
  );
};

interface LigaJornadaFechaCardProps {
  fecha: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (fecha: string) => void;
  onSave: () => void;
}

export const LigaJornadaFechaCard: React.FC<LigaJornadaFechaCardProps> = ({
  fecha,
  disabled,
  busy,
  onChange,
  onSave,
}) => (
  <div className="liga-card rv-card liga-jornada-programacion">
    <h2 className="liga-card__title">Programación de la jornada</h2>
    <p className="liga-hint">
      Define el día de la jornada y ajusta cancha y horario de cada partido para
      rotar parejas entre canchas.
    </p>
    <div className="liga-programacion-row liga-programacion-row--jornada">
      <label className="liga-programacion-field">
        <span className="liga-programacion-field__label">Día</span>
        <input
          id="liga-jornada-fecha"
          name="liga-jornada-fecha"
          type="date"
          value={fecha}
          disabled={disabled || busy}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Fecha de la jornada"
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || busy}
        onClick={onSave}
      >
        Guardar día
      </Button>
    </div>
  </div>
);

export function jornadaFechaDraft(
  fecha: string | null | undefined,
  drafts: Record<string, string>,
  jornadaId: string
): string {
  return drafts[jornadaId] ?? dateInputValue(fecha);
}
