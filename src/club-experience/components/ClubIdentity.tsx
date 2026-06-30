import React, { useState } from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { useOrganizerDisplayName } from "../useOrganizerDisplayName";
import {
  getCoBrandCompactLine,
  getMotherAttributionLine,
} from "../experienceFormatters";
import {
  resolveClubLogo,
  type ClubLogoSurface,
} from "../resolveClubLogo";
import "./ClubIdentity.css";

export type ClubIdentityVariant =
  | "header"
  | "compact"
  | "auth"
  | "inline"
  | "menu";

interface ClubIdentityProps {
  variant?: ClubIdentityVariant;
  showTagline?: boolean;
  logoSurface?: ClubLogoSurface;
  /** Logo horizontal del club; oculta el nombre duplicado y deja solo la atribución madre. */
  wordmarkOnly?: boolean;
  className?: string;
}

/**
 * Representa la identidad visual completa del club en la UI.
 * Riviera Open sola → logo + nombre + slogan.
 * Club con experiencia → nombre del club + "by Riviera Open".
 */
export const ClubIdentity: React.FC<ClubIdentityProps> = ({
  variant = "header",
  showTagline = true,
  logoSurface = "auto",
  wordmarkOnly = false,
  className = "",
}) => {
  const { manifest, isClubBranded, organizadorId } = useClubExperience();
  const organizerDisplayName = useOrganizerDisplayName(organizadorId);
  const [logoFailed, setLogoFailed] = useState(false);

  const logoUrl = resolveClubLogo(manifest, logoSurface);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const attribution = getMotherAttributionLine(manifest);
  const compactLine = getCoBrandCompactLine(manifest);
  const partnerWordmark = isClubBranded && wordmarkOnly;
  const motherLine =
    partnerWordmark || variant === "compact" || variant === "menu"
      ? partnerWordmark
        ? attribution
        : compactLine
      : attribution;

  const logoSize = variant === "auth" ? 56 : variant === "inline" ? 32 : 40;

  if (!isClubBranded) {
    return (
      <div
        className={`club-identity club-identity--mother club-identity--${variant} ${className}`.trim()}
      >
        {showLogo ? (
          <img
            src={logoUrl!}
            alt=""
            className="club-identity__logo"
            width={logoSize}
            height={logoSize}
            onError={() => setLogoFailed(true)}
          />
        ) : null}
        <div className="club-identity__text">
          <span className="club-identity__name">{organizerDisplayName}</span>
          {showTagline ? (
            <span className="club-identity__tagline">
              {manifest.slogans.primary}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`club-identity club-identity--partner club-identity--${variant}${
        partnerWordmark ? " club-identity--wordmark" : ""
      } ${className}`.trim()}
    >
      {showLogo ? (
        <img
          src={logoUrl!}
          alt={partnerWordmark ? manifest.displayName : ""}
          className="club-identity__logo"
          width={logoSize}
          height={logoSize}
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      <div className="club-identity__text">
        {!partnerWordmark ? (
          <span className="club-identity__name">{manifest.displayName}</span>
        ) : null}
        {variant === "compact" || variant === "menu" || partnerWordmark ? (
          <span className="club-identity__mother club-identity__mother--compact">
            {motherLine}
          </span>
        ) : (
          <span className="club-identity__mother">{attribution}</span>
        )}
        {showTagline && manifest.slogans.primary ? (
          <span className="club-identity__tagline">
            {manifest.slogans.primary}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/** @deprecated Usar ClubIdentity */
export const BrandSignature = ClubIdentity;

/** @deprecated Usar ClubIdentity */
export const CoBrandMark = ClubIdentity;
