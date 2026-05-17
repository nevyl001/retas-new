import React, { useState } from "react";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import "./AuthPage.css";

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
            <span className="auth-visual-brand__icon" aria-hidden>
              🏆
            </span>
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
        <div className="auth-mobile-brand auth-logo">
          <span className="auth-mobile-brand__icon" aria-hidden>
            🏆
          </span>
          <span className="auth-mobile-brand__name">RivieraApp</span>
          <p className="auth-mobile-tagline">Pádel competitivo</p>
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
