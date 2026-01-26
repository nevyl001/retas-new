import React from "react";

interface WelcomeBannerProps {
  isVisible: boolean;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="welcome-banner">
      <h2>Bienvenido</h2>
      <p>
        Organiza y gestiona tus retas de pádel de manera profesional. 
        Crea tu primera reta para comenzar.
      </p>
    </div>
  );
};

export default WelcomeBanner;
