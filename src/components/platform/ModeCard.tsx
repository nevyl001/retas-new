import React from "react";

interface ModeCardProps {
  title: string;
  description: string;
  typeLabel?: string;
  icon?: React.ReactNode;
  ctaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const ModeCard: React.FC<ModeCardProps> = ({
  title,
  description,
  typeLabel,
  icon,
  ctaLabel = "Iniciar",
  disabled,
  onClick,
  className = "",
  style,
  children,
}) => (
  <button
    type="button"
    className={`rv-card rv-mode-card${disabled ? " rv-mode-card--disabled" : ""} ${className}`.trim()}
    style={style}
    onClick={onClick}
    aria-disabled={disabled}
  >
    <div className="rv-mode-card__top">
      {icon ? (
        <span className="rv-mode-card__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {typeLabel ? <span className="rv-pill rv-pill--muted">{typeLabel}</span> : null}
    </div>
    <h3 className="rv-mode-card__title">{title}</h3>
    <p className="rv-mode-card__desc">{description}</p>
    {!disabled ? <span className="rv-mode-card__cta">{ctaLabel}</span> : null}
    {children}
  </button>
);
