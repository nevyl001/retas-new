import React from "react";

export interface LigaScoreInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** Identificador único del campo (también se usa como name si no se pasa name). */
  id: string;
  name?: string;
  maxLength?: number;
}

/** Casilla numérica directa para captura de games/puntos (draft string). */
export const LigaScoreInput: React.FC<LigaScoreInputProps> = ({
  value,
  onChange,
  disabled,
  ariaLabel,
  id,
  name,
  maxLength = 2,
}) => {
  return (
    <input
      id={id}
      name={name ?? id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className="liga-score-input"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      autoComplete="off"
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, maxLength);
        onChange(digits);
      }}
    />
  );
};
