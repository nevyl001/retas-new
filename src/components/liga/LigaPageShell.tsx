import React from "react";
import { GameModeShell } from "../platform/GameModeShell";
import "./liga-page.css";

export interface LigaPageShellProps {
  children: React.ReactNode;
  className?: string;
}

/** Fondo unificado (liga-page) + contenedor de contenido (liga-page__inner) */
export const LigaPageShell: React.FC<LigaPageShellProps> = ({
  children,
  className = "",
}) => {
  const pageClass = ["liga-page", className].filter(Boolean).join(" ");
  return (
    <div className={pageClass}>
      <GameModeShell className="liga-page__inner">{children}</GameModeShell>
    </div>
  );
};
