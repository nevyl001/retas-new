import React, { useState } from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { useOrganizerDisplayName } from "../useOrganizerDisplayName";
import { RIVIERA_PRODUCT_NAME } from "../motherBrand";
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
  /** Solo logo del upgrade (sin bloque de texto). */
  wordmarkOnly?: boolean;
  className?: string;
}

/**
 * Identidad en UI: siempre Riviera Open + nombre del organizador.
 * Upgrade premium → solo cambia logo y estilos (clase `club-identity--premium`).
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
  const logoSize = variant === "auth" ? 56 : variant === "inline" ? 32 : 40;

  const organizerLabel = organizerDisplayName?.trim() || "";
  const showOrganizerLine =
    !wordmarkOnly &&
    Boolean(organizerLabel) &&
    organizerLabel.localeCompare(RIVIERA_PRODUCT_NAME, undefined, {
      sensitivity: "accent",
    }) !== 0;
  const preferOrganizerOverTagline =
    variant === "header" || variant === "compact" || variant === "menu";
  const showSloganLine =
    !wordmarkOnly &&
    showTagline &&
    !(preferOrganizerOverTagline && showOrganizerLine);
  const logoOnly = wordmarkOnly && isClubBranded && showLogo;

  return (
    <div
      className={`club-identity club-identity--mother club-identity--${variant}${
        isClubBranded ? " club-identity--premium" : ""
      }${logoOnly ? " club-identity--logo-only" : ""} ${className}`.trim()}
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
      {!logoOnly ? (
        <div className="club-identity__text">
          <span className="club-identity__name">{RIVIERA_PRODUCT_NAME}</span>
          {showOrganizerLine ? (
            <span className="club-identity__organizer">{organizerLabel}</span>
          ) : null}
          {showSloganLine ? (
            <span className="club-identity__tagline">
              {manifest.slogans.primary}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/** @deprecated Usar ClubIdentity */
export const BrandSignature = ClubIdentity;

/** @deprecated Usar ClubIdentity */
export const CoBrandMark = ClubIdentity;
