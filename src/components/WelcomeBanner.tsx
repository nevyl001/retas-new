import React from "react";

interface WelcomeBannerProps {
  isVisible: boolean;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="welcome-banner">
      <h2>🏆 ¡Bienvenido a tu Gestor de Retas de Padel!</h2>
      <p>
        Organiza y gestiona tus retas de padel de manera elegante y profesional.
        ¡Que gane el mejor!
      </p>
      <div className="tutorial-steps">
        <div className="tutorial-step">
          <span className="tutorial-step-number">1</span>
          <span className="tutorial-step-icon">🏆</span>
          <span>Crea tu primera reta</span>
        </div>
        <div className="tutorial-step">
          <span className="tutorial-step-number">2</span>
          <span className="tutorial-step-icon">👥</span>
          <span>Añade jugadores participantes</span>
        </div>
        <div className="tutorial-step">
          <span className="tutorial-step-number">3</span>
          <span className="tutorial-step-icon">🤝</span>
          <span>Forma parejas</span>
        </div>
        <div className="tutorial-step">
          <span className="tutorial-step-number">4</span>
          <span className="tutorial-step-icon">⚡</span>
          <span>Inicia la reta y genera partidos</span>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBanner;
