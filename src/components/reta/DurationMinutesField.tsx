import React, { useState } from "react";
import {
  RETA_DURATION_MAX,
  RETA_DURATION_MIN,
  clampRetaDurationMinutes,
} from "../../lib/reta/retaConfigValidation";

const DURATION_STEP = 15;

type DurationMinutesFieldProps = {
  id: string;
  value: number;
  disabled?: boolean;
  /** Mientras se escribe. Puede ser menor al mínimo para armar el número. */
  onChange: (minutes: number) => void;
  /** Al salir del campo o al usar +/−. */
  onCommit: (minutes: number) => void;
};

/**
 * Duración tipeable (se puede vaciar para escribir otro número) y con +/−.
 * El mínimo se aplica al confirmar, no en cada tecla.
 */
export const DurationMinutesField: React.FC<DurationMinutesFieldProps> = ({
  id,
  value,
  disabled = false,
  onChange,
  onCommit,
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const step = (delta: number) => {
    const next = clampRetaDurationMinutes(value + delta);
    setDraft(null);
    onCommit(next);
  };

  return (
    <div className="reta-details-form__stepper reta-details-form__stepper--typeable">
      <button
        type="button"
        className="home-sheet__stepper-btn"
        aria-label="Menos duración"
        disabled={disabled || value <= RETA_DURATION_MIN}
        onClick={() => step(-DURATION_STEP)}
      >
        −
      </button>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        className="reta-details-form__stepper-input"
        value={shown}
        disabled={disabled}
        aria-label="Duración en minutos"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
          setDraft(digits);
          if (digits === "") return;
          const n = Number(digits);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(RETA_DURATION_MAX, Math.max(0, n)));
        }}
        onBlur={() => {
          const next = clampRetaDurationMinutes(
            shown.trim() === "" ? value : Number(shown)
          );
          setDraft(null);
          onCommit(next);
        }}
      />
      <button
        type="button"
        className="home-sheet__stepper-btn"
        aria-label="Más duración"
        disabled={disabled || value >= RETA_DURATION_MAX}
        onClick={() => step(DURATION_STEP)}
      >
        +
      </button>
    </div>
  );
};
