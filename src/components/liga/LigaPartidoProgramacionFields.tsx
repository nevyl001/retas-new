import React from "react";
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
  onChange,
  onSave,
}) => {
  const canchaOptions = Array.from(
    { length: Math.max(1, canchasDisponibles) },
    (_, i) => i + 1
  );

  return (
    <div className="liga-programacion-row">
      <label className="liga-programacion-field">
        <span className="liga-programacion-field__label">Cancha</span>
        <select
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
          type="time"
          value={draft.hora}
          disabled={disabled || busy}
          onChange={(e) => onChange({ ...draft, hora: e.target.value })}
          aria-label={`Horario partido ${partido.id}`}
        />
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || busy}
        onClick={onSave}
      >
        Guardar cancha/hora
      </Button>
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
