import React from "react";
import { GameModeShell } from "../platform/GameModeShell";
import "./torneo-express.css";
import "./riviera-torneo-express.css";
import "./te-fondos.css";

export interface TePageShellProps {
  children: React.ReactNode;
  className?: string;
  /** Espacio bajo UserHeader; default true */
  withHeaderOffset?: boolean;
}

export const TePageShell: React.FC<TePageShellProps> = ({
  children,
  className = "",
  withHeaderOffset = true,
}) => {
  const classes = [
    "torneo-express-page",
    withHeaderOffset && "torneo-express-page--offset",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <GameModeShell className={classes}>{children}</GameModeShell>;
};
