import React from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { ClubIdentity } from "./ClubIdentity";

type PublicEventBrandIdentityProps = {
  className?: string;
};

/**
 * Slot de marca en vistas públicas de eventos.
 * Reutiliza ClubIdentity (mismo componente del home / UserHeader).
 * - Pending (org desconocido / binding en curso): no renderiza nada.
 * - Sin upgrade: logo Riviera Open + "Riviera Open" + nombre de la cuenta.
 * - Con upgrade: solo logo del club (wordmarkOnly).
 */
export const PublicEventBrandIdentity: React.FC<
  PublicEventBrandIdentityProps
> = ({ className = "" }) => {
  const { isClubBranded, isScopeBrandingReady, brandingStatus } =
    useClubExperience();

  if (!isScopeBrandingReady || brandingStatus === "pending") {
    return null;
  }

  return (
    <ClubIdentity
      variant="compact"
      showTagline={false}
      logoSurface="dark"
      wordmarkOnly={isClubBranded}
      className={className}
    />
  );
};
