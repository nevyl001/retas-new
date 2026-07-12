import React from "react";
import { ClubExperienceScope, PublicEventBrandIdentity } from "../../../club-experience";
import { PublicModeShell } from "../../platform/PublicModeShell";
import "./torneo-express-public.css";

export const PublicTorneoExpressShell: React.FC<{
  children: React.ReactNode;
  className?: string;
  organizadorId?: string | null;
}> = ({ children, className = "", organizadorId = null }) => {
  return (
    <ClubExperienceScope organizadorId={organizadorId}>
      <div className={`te-public App--public-full-width ${className}`.trim()}>
        <div className="te-public__grain" aria-hidden />
        <PublicModeShell className="te-public__inner">
          <div className="te-public-brand-bar">
            <PublicEventBrandIdentity className="te-public-header__club-identity" />
          </div>
          {children}
        </PublicModeShell>
      </div>
    </ClubExperienceScope>
  );
};
