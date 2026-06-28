import React from "react";

interface PublicModeShellProps {
  children: React.ReactNode;
  className?: string;
}

/** Contenedor de tableros públicos compartibles. Solo layout. */
export const PublicModeShell: React.FC<PublicModeShellProps> = ({
  children,
  className = "",
}) => (
  <div className={`rv-public-board ${className}`.trim()}>{children}</div>
);
