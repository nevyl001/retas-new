import React from "react";

interface ModeHeaderProps {
  eyebrow?: string;
  title: string;
  titleId?: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ModeHeader: React.FC<ModeHeaderProps> = ({
  eyebrow,
  title,
  titleId,
  subtitle,
  className = "",
  children,
}) => (
  <header className={`rv-mode-header ${className}`.trim()}>
    {eyebrow ? <p className="rv-mode-header__eyebrow">{eyebrow}</p> : null}
    <h1 id={titleId} className="rv-mode-header__title">
      {title}
    </h1>
    {subtitle ? <p className="rv-mode-header__sub">{subtitle}</p> : null}
    {children}
  </header>
);
