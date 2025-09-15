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
      <div className="auth-background"></div>

      <div className="auth-layout">
        <div className="auth-hero">
          <div className="auth-logo">
            <h1>🏆 Retas de Pádel</h1>
            <p className="hero-subtitle">
              Gestiona tus retas de pádel de forma profesional
            </p>
          </div>

          <div className="hero-content">
            <h2 className="hero-title">
              ¡Únete a la mejor plataforma de retas de pádel!
            </h2>

            <div className="features-list">
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <div className="feature-text">
                  <h3>Organización Instantánea</h3>
                  <p>
                    Crea y gestiona retas de pádel en segundos con nuestro
                    sistema inteligente
                  </p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">📊</span>
                <div className="feature-text">
                  <h3>Estadísticas en Tiempo Real</h3>
                  <p>
                    Mantén un seguimiento completo de resultados y
                    clasificaciones
                  </p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">🌐</span>
                <div className="feature-text">
                  <h3>Acceso Público</h3>
                  <p>
                    Comparte tus retas de pádel con enlaces públicos para máxima
                    visibilidad
                  </p>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon">🏆</span>
                <div className="feature-text">
                  <h3>Experiencia Premium</h3>
                  <p>
                    Interfaz moderna y fácil de usar para una gestión
                    profesional
                  </p>
                </div>
              </div>
            </div>

            <div className="cta-section">
              <p className="cta-text">
                ¿Listo para revolucionar tus retas de pádel?
              </p>
              <p className="cta-subtext">
                Inicia sesión o regístrate para comenzar
              </p>
            </div>
          </div>
        </div>

        <div className="auth-form-section">
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
