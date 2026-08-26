import React from "react";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { getTeamLogoInitials } from "../../../lib/reta/teamLogoDisplay";

export type TeamLogoSize = "sm" | "md" | "lg" | "xl" | "hero";

type TeamLogoProps = {
  logoUrl?: string | null;
  teamName: string;
  size?: TeamLogoSize;
  className?: string;
  /** Preferente en hero público. */
  loading?: "eager" | "lazy";
};

/**
 * Logo 1:1 con object-fit: contain + fallback de iniciales.
 */
export const TeamLogo: React.FC<TeamLogoProps> = ({
  logoUrl,
  teamName,
  size = "md",
  className = "",
  loading = "lazy",
}) => {
  const initials = getTeamLogoInitials(teamName);
  const { src, onError } = useRetryableImage(logoUrl);
  const cls = [
    "reta-eq-logo",
    `reta-eq-logo--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (src) {
    return (
      <span className={cls}>
        <img
          className="reta-eq-logo__img"
          src={src}
          alt={`Logo ${teamName}`}
          loading={loading}
          decoding="async"
          onError={onError}
        />
      </span>
    );
  }

  return (
    <span className={cls} aria-label={teamName} role="img">
      <span className="reta-eq-logo__initials" aria-hidden>
        {initials}
      </span>
    </span>
  );
};
