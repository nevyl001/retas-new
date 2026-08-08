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
 * - Vista pública SIEMPRE es genérica (2026-08-08, sin white label): logo
 *   Riviera Open + "Riviera Open" + nombre de la cuenta como texto, tenga o
 *   no upgrade de branding. El logo propio del club (si lo tiene) solo se ve
 *   en superficies privadas del organizador (UserHeader/menú), nunca aquí.
 */
export const PublicEventBrandIdentity: React.FC<
  PublicEventBrandIdentityProps
> = ({ className = "", showMotherAttribution = true }) => {
  const { isScopeBrandingReady, brandingStatus } = useClubExperience();

  if (!isScopeBrandingReady || brandingStatus === "pending") {
    return null;
  }

  return (
    <ClubIdentity
      variant="compact"
      showTagline={false}
      logoSurface="dark"
      forceRivieraLogo
      showMotherAttribution={showMotherAttribution}
      className={className}
    />
  );
};
