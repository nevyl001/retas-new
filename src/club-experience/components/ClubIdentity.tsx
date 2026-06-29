import React, { useState } from "react";
import { useClubExperience } from "../ClubExperienceContext";
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
  className = "",
}) => {
  const { manifest, isClubBranded } = useClubExperience();
  const [logoFailed, setLogoFailed] = useState(false);

  const logoUrl = resolveClubLogo(manifest, logoSurface);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const attribution = getMotherAttributionLine(manifest);
  const compactLine = getCoBrandCompactLine(manifest);

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
          <span className="club-identity__name">{manifest.displayName}</span>
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
      className={`club-identity club-identity--partner club-identity--${variant} ${className}`.trim()}
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
        <span className="club-identity__name">{manifest.displayName}</span>
        {variant === "compact" || variant === "menu" ? (
          <span className="club-identity__mother club-identity__mother--compact">
            {compactLine}
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
