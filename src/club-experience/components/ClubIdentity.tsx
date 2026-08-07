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
  /** En modo `wordmarkOnly`, conserva visible la atribución "by Riviera Open". */
  showMotherAttribution?: boolean;
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
  showMotherAttribution = false,
  className = "",
}) => {
  const { manifest, isClubBranded, organizadorId } = useClubExperience();
  const organizerDisplayName = useOrganizerDisplayName(organizadorId);
  const [logoFailed, setLogoFailed] = useState(false);

  const logoUrl = resolveClubLogo(manifest, logoSurface);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  /** Hint cuadrado solo para Riviera; logos premium horizontales no deben forzar 1:1. */
  const logoSizeHint = variant === "auth" ? 56 : variant === "inline" ? 32 : 40;

  const organizerLabel = organizerDisplayName?.trim() || "";
  const clubLogoIdentifiesOrganizer = isClubBranded && showLogo;
  const showOrganizerLine =
    !wordmarkOnly &&
    !clubLogoIdentifiesOrganizer &&
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
  const useStackedClubHeader =
    isClubBranded && showLogo && variant === "header" && !wordmarkOnly;
  const showAttributionOnly = logoOnly && showMotherAttribution;

  const motherAttribution = (
    <span className="club-identity__attribution">
      <span className="club-identity__attribution-by">by</span>{" "}
      <span className="club-identity__attribution-brand">
        {RIVIERA_PRODUCT_NAME}
      </span>
    </span>
  );

  return (
    <div
      className={`club-identity club-identity--mother club-identity--${variant}${
        isClubBranded ? " club-identity--premium" : ""
      }${logoOnly ? " club-identity--logo-only" : ""}${
        useStackedClubHeader ? " club-identity--stacked" : ""
      } ${className}`.trim()}
    >
      {showLogo ? (
        <img
          src={logoUrl!}
          alt=""
          className="club-identity__logo"
          {...(isClubBranded
            ? {}
            : { width: logoSizeHint, height: logoSizeHint })}
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      {showAttributionOnly ? (
        <div className="club-identity__text">{motherAttribution}</div>
      ) : null}
      {!logoOnly ? (
        <div className="club-identity__text">
          {useStackedClubHeader ? (
            motherAttribution
          ) : (
            <>
              <span className="club-identity__name">{RIVIERA_PRODUCT_NAME}</span>
              {showOrganizerLine ? (
                <span className="club-identity__organizer">{organizerLabel}</span>
              ) : null}
              {showSloganLine ? (
                <span className="club-identity__tagline">
                  {manifest.slogans?.primary ?? ""}
                </span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

/** @deprecated Usar ClubIdentity */
export const BrandSignature = ClubIdentity;

/** @deprecated Usar ClubIdentity */
export const CoBrandMark = ClubIdentity;
