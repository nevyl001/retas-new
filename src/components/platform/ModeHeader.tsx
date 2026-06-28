import React from "react";

interface ModeHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ModeHeader: React.FC<ModeHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  className = "",
  children,
}) => (
  <header className={`rv-mode-header ${className}`.trim()}>
    {eyebrow ? <p className="rv-mode-header__eyebrow">{eyebrow}</p> : null}
    <h1 className="rv-mode-header__title">{title}</h1>
    {subtitle ? <p className="rv-mode-header__sub">{subtitle}</p> : null}
    {children}
  </header>
);
