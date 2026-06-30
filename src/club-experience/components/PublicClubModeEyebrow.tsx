import React from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { useOrganizerDisplayName } from "../useOrganizerDisplayName";
import { ClubIdentity } from "./ClubIdentity";

interface PublicClubModeEyebrowProps {
  modeLabel: string;
  className?: string;
  clubIdentityClassName?: string;
}

/** Eyebrow de marca en vistas públicas (dentro de ClubExperienceScope). */
export const PublicClubModeEyebrow: React.FC<PublicClubModeEyebrowProps> = ({
  modeLabel,
  className = "liga-pantalla__eyebrow",
  clubIdentityClassName = "liga-pantalla__club-identity",
}) => {
  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName();

  return (
    <>
      {isClubBranded ? (
        <ClubIdentity
          variant="compact"
          showTagline={false}
          logoSurface="dark"
          wordmarkOnly
          className={clubIdentityClassName}
        />
      ) : null}
      <p className={className}>
        {organizerName} · {modeLabel}
      </p>
    </>
  );
};
