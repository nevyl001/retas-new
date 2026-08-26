import React from "react";
import { useClubExperience } from "../ClubExperienceContext";
import { PublicEventNeutralLoading } from "./PublicEventNeutralLoading";

type Props = {
  children: React.ReactNode;
  message?: string;
};

/**
 * Evita flash Riviera→club en vistas públicas:
 * no pinta el contenido del evento hasta que el scope tenga tokens
 * del tenant (o Riviera definitivo sin upgrade).
 */
export const PublicScopedBrandGate: React.FC<Props> = ({
  children,
  message = "Cargando…",
}) => {
  const { canPaintScopedBrand } = useClubExperience();
  if (!canPaintScopedBrand) {
    return <PublicEventNeutralLoading message={message} />;
  }
  return <>{children}</>;
};
