import React, { useState } from "react";
import { RIVIERA_APP_TAGLINE } from "../../lib/rivieraBranding";
import { useBrand } from "../BrandContext";
import "./CoBrandMark.css";

type CoBrandMarkVariant = "header" | "compact" | "auth";

interface CoBrandMarkProps {
  variant?: CoBrandMarkVariant;
  showTagline?: boolean;
  className?: string;
}

export const CoBrandMark: React.FC<CoBrandMarkProps> = ({
  variant = "header",
  showTagline = true,
  className = "",
}) => {
  const { brand, isCoBranded } = useBrand();
  const [logoFailed, setLogoFailed] = useState(false);

  if (!isCoBranded) {
    return (
      <div className={`co-brand co-brand--riviera ${className}`.trim()}>
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt=""
            className="co-brand__logo"
            width={variant === "auth" ? 56 : 40}
            height={variant === "auth" ? 56 : 40}
          />
        ) : null}
        <div className="co-brand__text">
          <span className="co-brand__name">{brand.displayName}</span>
          {showTagline ? (
            <span className="co-brand__tagline">{RIVIERA_APP_TAGLINE}</span>
          ) : null}
        </div>
      </div>
    );
  }

  const showLogo = brand.logoUrl && !logoFailed;

  return (
    <div
      className={`co-brand co-brand--partner co-brand--${variant} ${className}`.trim()}
    >
      {showLogo ? (
        <img
          src={brand.logoUrl!}
          alt=""
          className="co-brand__logo"
          width={variant === "auth" ? 56 : 40}
          height={variant === "auth" ? 56 : 40}
          onError={() => setLogoFailed(true)}
        />
      ) : null}
      <div className="co-brand__text">
        <span className="co-brand__name">{brand.displayName}</span>
        {variant === "compact" ? (
          <span className="co-brand__mother co-brand__mother--compact">
            {brand.coBrandCompact}
          </span>
        ) : (
          <span className="co-brand__mother">{brand.coBrandLine}</span>
        )}
        {showTagline && brand.slogan ? (
          <span className="co-brand__tagline">{brand.slogan}</span>
        ) : null}
      </div>
    </div>
  );
};
