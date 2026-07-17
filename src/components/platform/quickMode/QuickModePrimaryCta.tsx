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
      >
        {loading ? "…" : label}
      </button>
      {hint ? <p className="qm-primary-cta__hint">{hint}</p> : null}
    </div>
  );
}
