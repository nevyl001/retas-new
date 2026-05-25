import React, { useState } from "react";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import "./AuthPage.css";

/** PNG con transparencia (public/logo-riviera.png) */
const AUTH_LOGO_SRC = "/logo-riviera.png?v=1";

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  return (
    <div className="auth-page">
      <div className="auth-visual-panel" aria-hidden="true">
        <div className="auth-visual-panel__inner">
          <div className="auth-visual-brand auth-logo">
            <img
              src={AUTH_LOGO_SRC}
              alt="RivieraApp logo"
              className="auth-visual-brand__logo logo-img"
              width={56}
              height={56}
            />
            <span className="auth-visual-brand__name">RivieraApp</span>
          </div>
          <h2 className="auth-visual-title text-display">
            Tu pádel,
            <br />
            organizado.
          </h2>
          <p className="auth-visual-subtitle">
            Crea retas, gestiona torneos y sigue el ranking de tu grupo.
          </p>
          <p className="auth-visual-proof">Usado por +200 jugadores activos</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-mobile-hero auth-logo" aria-label="RivieraApp">
          <img
            src={AUTH_LOGO_SRC}
            alt="RivieraApp logo"
            className="auth-mobile-hero__logo logo-img"
            width={64}
            height={64}
          />
          <span className="auth-mobile-hero__name">RivieraApp</span>
          <h2 className="auth-mobile-hero__title">
            Tu pádel,
            <br />
            organizado.
          </h2>
          <p className="auth-mobile-hero__subtitle">
            Crea retas, gestiona torneos y sigue el ranking.
          </p>
          <p className="auth-mobile-hero__proof">Usado por +200 jugadores activos</p>
        </div>

        <div className="auth-form-panel__card-wrap">
          {isLoginMode ? (
            <LoginForm onToggleMode={toggleMode} />
          ) : (
            <RegisterForm onToggleMode={toggleMode} />
          )}
        </div>
      </div>
    </div>
  );
};
