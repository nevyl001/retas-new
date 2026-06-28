import React from "react";

interface GameModeShellProps {
  children: React.ReactNode;
  className?: string;
}

/** Contenedor interno de un modo de juego (organizador). Solo layout. */
export const GameModeShell: React.FC<GameModeShellProps> = ({
  children,
  className = "",
}) => (
  <div className={`rv-page rv-shell ${className}`.trim()}>{children}</div>
);
