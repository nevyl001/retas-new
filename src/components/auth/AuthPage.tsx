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
      <div className="auth-background">
        <div className="auth-background-pattern"></div>
      </div>

      <div className="auth-content">
        <div className="auth-logo">
          <h1>🏆 Retas de Pádel</h1>
          <p>Gestiona tus torneos de pádel de forma profesional</p>
        </div>

        {isLoginMode ? (
          <LoginForm onToggleMode={toggleMode} />
        ) : (
          <RegisterForm onToggleMode={toggleMode} />
        )}
      </div>
    </div>
  );
};
