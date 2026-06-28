import React from "react";
import { PublicModeShell } from "../../platform/PublicModeShell";
import "./torneo-express-public.css";

export const PublicTorneoExpressShell: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  return (
    <div className={`te-public App--public-full-width ${className}`.trim()}>
      <div className="te-public__grain" aria-hidden />
      <PublicModeShell className="te-public__inner">{children}</PublicModeShell>
    </div>
  );
};
