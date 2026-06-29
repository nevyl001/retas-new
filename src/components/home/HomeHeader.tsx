import React from "react";
import { getHomeEyebrow, useBrand } from "../../branding";
import { ModeHeader } from "../platform/ModeHeader";

interface HomeHeaderProps {
  userName?: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({ userName }) => {
  const { brand, isCoBranded } = useBrand();
  const displayName = userName?.trim() || "Organizador";
  const eyebrow = getHomeEyebrow(brand, isCoBranded);

  return (
    <ModeHeader
      className="home-header rv-mode-header rv-mode-header--entry"
      eyebrow={eyebrow}
      title="¿Qué quieres jugar hoy?"
      subtitle={
        userName?.trim()
          ? `Hola, ${displayName}. Elige un modo y lanza tu reta en menos de un minuto.`
          : "Elige un modo y lanza tu reta en menos de un minuto."
      }
    />
  );
};
