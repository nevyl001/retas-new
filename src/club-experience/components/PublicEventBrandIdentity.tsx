import React from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { ClubIdentity } from "./ClubIdentity";

type PublicEventBrandIdentityProps = {
  className?: string;
};

/**
 * Slot de marca en vistas públicas de eventos.
 * Reutiliza ClubIdentity (mismo componente del home / UserHeader).
 * - Sin upgrade: logo Riviera Open + "Riviera Open" + nombre de la cuenta
 *   (mismo patrón que el home; sin wordmarkOnly).
 * - Con upgrade: solo logo del club (wordmarkOnly), como hoy en público.
 */
export const PublicEventBrandIdentity: React.FC<
  PublicEventBrandIdentityProps
> = ({ className = "" }) => {
  const { isClubBranded } = useClubExperience();

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
