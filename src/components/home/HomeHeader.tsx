import React from "react";
import { ModeHeader } from "../platform/ModeHeader";

interface HomeHeaderProps {
  userName?: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({ userName }) => {
  const displayName = userName?.trim() || "Organizador";

  return (
    <ModeHeader
      className="home-header rv-mode-header"
      eyebrow={`Hola, ${displayName}`}
      title="¿Qué quieres jugar hoy?"
      subtitle="Elige un modo y lanza tu reta en menos de un minuto."
    />
  );
};
