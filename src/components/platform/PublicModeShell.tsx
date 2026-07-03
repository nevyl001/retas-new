import React from "react";
import "../../styles/riviera-peds-tokens.css";
import { isPubDsV2Enabled } from "../../config/peds";

export type PubDensity = "compact" | "comfortable" | "expanded";

export interface PublicModeShellProps {
  children: React.ReactNode;
  className?: string;
  density?: PubDensity;
}

/** Contenedor de tableros públicos compartibles. Solo layout. */
export const PublicModeShell: React.FC<PublicModeShellProps> = ({
  children,
  className = "",
  density = "comfortable",
}) => {
  const classes = [
    "rv-public-board",
    isPubDsV2Enabled ? "peds-scope" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!isPubDsV2Enabled) {
    return <div className={classes}>{children}</div>;
  }

  return (
    <div className={classes} data-pub-density={density}>
      {children}
    </div>
  );
};
