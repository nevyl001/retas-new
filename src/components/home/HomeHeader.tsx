import React from "react";

interface HomeHeaderProps {
  userName?: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({ userName }) => {
  const displayName = userName?.trim() || "Organizador";

  return (
    <header className="home-header">
      <div className="home-header__text">
        <p className="home-header__greeting">Hola, {displayName} 👋</p>
        <h1 className="home-header__hero">¿Qué quieres jugar hoy?</h1>
        <p className="home-header__sub">
          Elige un modo y lanza tu reta en menos de un minuto.
        </p>
      </div>
    </header>
  );
};
