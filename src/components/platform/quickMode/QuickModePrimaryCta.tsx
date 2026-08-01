import React from "react";

export type QuickModePrimaryCtaProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Texto mientras calcula (default: Calculando partidos…). */
  loadingLabel?: string;
  className?: string;
  hint?: string | null;
  /** sidebar = tamaño normal (~48–52px), no full-bleed */
  variant?: "default" | "sidebar";
  testId?: string;
};

/** CTA primario de preparación. */
export function QuickModePrimaryCta({
  label,
  onClick,
  disabled = false,
  loading = false,
  loadingLabel = "Calculando partidos…",
  className = "",
  hint,
  variant = "default",
  testId,
}: QuickModePrimaryCtaProps) {
  const busyHint = loading
    ? "El sistema está armando los partidos. Espera un momento…"
    : hint;

  return (
    <div
      className={`qm-primary-cta qm-primary-cta--${variant}${
        loading ? " is-loading" : ""
      } ${className}`.trim()}
    >
      {loading ? (
        <div className="qm-primary-cta__busy" role="status" aria-live="polite">
          <span className="qm-primary-cta__spinner" aria-hidden />
          <span className="qm-primary-cta__busy-copy">
            Generando el cuadro de juegos
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className="qm-primary-cta__btn"
        onClick={onClick}
        disabled={disabled || loading}
        data-testid={testId}
        aria-busy={loading || undefined}
      >
        {loading ? (
          <>
            <span className="qm-primary-cta__spinner" aria-hidden />
            <span>{loadingLabel}</span>
          </>
        ) : (
          label
        )}
      </button>
      {busyHint ? (
        <p className="qm-primary-cta__hint">{busyHint}</p>
      ) : null}
    </div>
  );
}
