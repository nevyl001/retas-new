import React from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
  useClubExperience,
} from "../../../club-experience";
import { debugLog } from "../../../lib/debug/debugLog";
import { PublicModeShell } from "../../platform/PublicModeShell";
import "./torneo-express-public.css";

const PublicTorneoExpressShellInner: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => {
  const { isScopeBrandingReady, brandingStatus, organizadorId } =
    useClubExperience();

  if (brandingStatus === "pending") {
    debugLog("[branding-flash] public-route: loading-resource", {
      organizadorId,
    });
  } else if (organizadorId) {
    debugLog("[branding-flash] public-route: organizer-resolved", {
      organizadorId,
    });
  }

  return (
    <div className={`te-public App--public-full-width ${className}`.trim()}>
      <div className="te-public__grain" aria-hidden />
      <PublicModeShell className="te-public__inner">
        <div
          className={`te-public-brand-bar${
            isScopeBrandingReady ? "" : " te-public-brand-bar--pending"
          }`}
        >
          {isScopeBrandingReady ? (
            <PublicEventBrandIdentity className="te-public-header__club-identity" />
          ) : null}
        </div>
        {children}
      </PublicModeShell>
    </div>
  );
};

/**
 * Shell público TE / Reta / Americano.
 * `pendingUntilOrganizador`: no pinta Riviera mientras el org del evento es null.
 */
export const PublicTorneoExpressShell: React.FC<{
  children: React.ReactNode;
  className?: string;
  organizadorId?: string | null;
}> = ({ children, className = "", organizadorId = null }) => {
  return (
    <ClubExperienceScope
      organizadorId={organizadorId}
      pendingUntilOrganizador
    >
      <PublicTorneoExpressShellInner className={className}>
        {children}
      </PublicTorneoExpressShellInner>
    </ClubExperienceScope>
  );
};
