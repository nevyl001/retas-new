import React from "react";

export type QuickModePrimaryCtaProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
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
  className = "",
  hint,
  variant = "default",
  testId,
}: QuickModePrimaryCtaProps) {
  return (
    <div
      className={`qm-primary-cta qm-primary-cta--${variant} ${className}`.trim()}
    >
      <button
        type="button"
        className="qm-primary-cta__btn"
        onClick={onClick}
        disabled={disabled || loading}
        data-testid={testId}
      >
        {loading ? "…" : label}
      </button>
      {hint ? <p className="qm-primary-cta__hint">{hint}</p> : null}
    </div>
  );
}
