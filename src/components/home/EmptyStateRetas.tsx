import React from "react";

export const EmptyStateRetas: React.FC = () => {
  return (
    <div className="home-empty-retas">
      <span className="home-empty-retas__icon" aria-hidden>
        🏓
      </span>
      <p className="home-empty-retas__title">Aún no has creado retas</p>
      <p className="home-empty-retas__text">
        Selecciona un modo arriba para empezar a jugar.
      </p>
    </div>
  );
};
