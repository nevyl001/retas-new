import React from "react";
import { GameModeShell } from "../platform/GameModeShell";
import "./duelo2v2-page.css";

export interface Duelo2v2PageShellProps {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
  publicView?: boolean;
}

export const Duelo2v2PageShell: React.FC<Duelo2v2PageShellProps> = ({
  children,
  className = "",
  wide = false,
  publicView = false,
}) => {
  const pageClass = [
    "duelo2v2-page",
    wide ? "duelo2v2-page--wide" : "",
    publicView ? "duelo2v2-page--public" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const innerClass = [
    "duelo2v2-page__inner",
    wide ? "duelo2v2-page__inner--wide" : "",
    publicView ? "duelo2v2-page__inner--public" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClass}>
      <GameModeShell className={innerClass}>{children}</GameModeShell>
    </div>
  );
};
