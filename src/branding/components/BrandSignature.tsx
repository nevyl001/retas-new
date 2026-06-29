import React, { useState } from "react";
import {
  getCoBrandCompactLine,
  getMotherAttributionLine,
} from "../brandFormatters";
import { useBrand } from "../BrandContext";
import { resolveBrandLogo } from "../resolveBrandLogo";
import type { BrandLogoSurface } from "../resolveBrandLogo";
import "./BrandSignature.css";

export type BrandSignatureVariant =
  | "header"
  | "compact"
  | "auth"
  | "inline"
  | "menu";

interface BrandSignatureProps {
  variant?: BrandSignatureVariant;
  showTagline?: boolean;
  logoSurface?: BrandLogoSurface;
  className?: string;
}

/**
 * Único componente de identidad visual en la app.
 * Riviera Open sola → logo + nombre + slogan.
 * Partner activo → nombre del club + "by Riviera Open" (+ slogan opcional).
 */
export const BrandSignature: React.FC<BrandSignatureProps> = ({
  variant = "header",
  showTagline = true,
  logoSurface = "auto",
  className = "",
}) => {
  const { brand, isCoBranded } = useBrand();
  const [logoFailed, setLogoFailed] = useState(false);

  const logoUrl = resolveBrandLogo(brand, logoSurface);
  const showLogo = Boolean(logoUrl) && !logoFailed;
  const attribution = getMotherAttributionLine(brand);
  const compactLine = getCoBrandCompactLine(brand);

  const logoSize = variant === "auth" ? 56 : variant === "inline" ? 32 : 40;

  if (!isCoBranded) {
    return (
      <div
        className={`brand-signature brand-signature--mother brand-signature--${variant} ${className}`.trim()}
      >
        {showLogo ? (
          <img
            src={logoUrl!}
            alt=""
            className="brand-signature__logo"
            width={logoSize}
            height={logoSize}
            onError={() => setLogoFailed(true)}
          />
        ) : null}
        <div className="brand-signature__text">
          <span className="brand-signature__name">{brand.displayName}</span>
          {showTagline ? (
            <span className="brand-signature__tagline">
              {brand.messaging.slogan}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`brand-signature brand-signature--partner brand-signature--${variant} ${className}`.trim()}
    >
      {showLogo ? (
        <img
          src={logoUrl!}
          alt=""
          className="brand-signature__logo"
          width={logoSize}
          height={logoSize}
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      <div className="brand-signature__text">
        <span className="brand-signature__name">{brand.displayName}</span>
        {variant === "compact" || variant === "menu" ? (
          <span className="brand-signature__mother brand-signature__mother--compact">
            {compactLine}
          </span>
        ) : (
          <span className="brand-signature__mother">{attribution}</span>
        )}
        {showTagline && brand.messaging.slogan ? (
          <span className="brand-signature__tagline">
            {brand.messaging.slogan}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/** @deprecated Usar BrandSignature */
export const CoBrandMark = BrandSignature;
