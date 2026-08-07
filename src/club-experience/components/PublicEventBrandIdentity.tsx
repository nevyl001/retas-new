import React from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { ClubIdentity } from "./ClubIdentity";

type PublicEventBrandIdentityProps = {
  className?: string;
  /** Desactivar solo si la vista ya imprime la atribución madre por su cuenta. */
  showMotherAttribution?: boolean;
};

/**
 * Slot de marca en vistas públicas de eventos.
 * Reutiliza ClubIdentity (mismo componente del home / UserHeader).
 * - Pending (org desconocido / binding en curso): no renderiza nada.
 * - Sin upgrade: logo Riviera Open + "Riviera Open" + nombre de la cuenta.
 * - Con upgrade: logo del club + atribución "by Riviera Open", que debe estar
 *   siempre presente en las vistas públicas.
 */
export const PublicEventBrandIdentity: React.FC<
  PublicEventBrandIdentityProps
> = ({ className = "", showMotherAttribution = true }) => {
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
      showMotherAttribution={showMotherAttribution}
      className={className}
    />
  );
};
