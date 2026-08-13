import React from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { ClubIdentity } from "./ClubIdentity";

type PublicEventBrandIdentityProps = {
  className?: string;
  /** Desactivar solo si la vista ya imprime la atribución madre por su cuenta. */
  showMotherAttribution?: boolean;
  /**
   * Solo logo Riviera Open (sin nombre de cuenta ni "by Riviera Open").
   * Útil en celebraciones donde el wordmark de la card ya aporta la marca.
   */
  logoOnly?: boolean;
};

/**
 * Slot de marca en vistas públicas de eventos.
 * Reutiliza ClubIdentity (mismo componente del home / UserHeader).
 * - Pending (org desconocido / binding en curso): no renderiza nada.
 * - Vista pública SIEMPRE es genérica (2026-08-08, sin white label): logo
 *   Riviera Open (+ nombre de cuenta salvo `logoOnly`), nunca el logo propio
 *   del club. El logo propio solo se ve en superficies privadas del organizador.
 */
export const PublicEventBrandIdentity: React.FC<
  PublicEventBrandIdentityProps
> = ({
  className = "",
  showMotherAttribution = true,
  logoOnly = false,
}) => {
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
      hideOrganizerName={logoOnly}
      showMotherAttribution={logoOnly ? false : showMotherAttribution}
      className={className}
    />
  );
};
