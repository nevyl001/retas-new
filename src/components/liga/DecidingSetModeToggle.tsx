import React from "react";

export type DecidingSetModeValue = "regular" | "stb";

type Props = {
  value: DecidingSetModeValue;
  onChange: (next: DecidingSetModeValue) => void;
  disabled?: boolean;
  /** Compacto para MatchScoreCard. */
  compact?: boolean;
  regularLabel?: string;
  stbLabel?: string;
};

/**
 * Confirma el cambio de modalidad si ya hay puntos en el set decisivo.
 * Devuelve true si se puede aplicar el cambio.
 */
export function confirmDecidingModeSwitch(hasCapturedScores: boolean): boolean {
  if (!hasCapturedScores) return true;
  return window.confirm(
    "Cambiar el tipo de set decisivo descartará los puntos capturados en ese set. ¿Continuar?"
  );
}

export const DecidingSetModeToggle: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  compact = false,
  regularLabel = "Set completo",
  stbLabel = "Super Tie-Break",
}) => {
  return (
    <div
      className={`liga-deciding-mode${compact ? " liga-deciding-mode--compact" : ""}`}
      role="group"
      aria-label="Tipo de set decisivo"
    >
      <span className="liga-deciding-mode__label">Tipo de set decisivo</span>
      <div className="liga-deciding-mode__seg">
        <button
          type="button"
          className={`liga-deciding-mode__btn${
            value === "regular" ? " is-active" : ""
          }`}
          disabled={disabled}
          aria-pressed={value === "regular"}
          onClick={() => onChange("regular")}
        >
          {regularLabel}
        </button>
        <button
          type="button"
          className={`liga-deciding-mode__btn${
            value === "stb" ? " is-active" : ""
          }`}
          disabled={disabled}
          aria-pressed={value === "stb"}
          onClick={() => onChange("stb")}
        >
          {stbLabel}
        </button>
      </div>
    </div>
  );
};
