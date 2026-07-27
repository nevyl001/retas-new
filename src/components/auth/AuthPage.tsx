import React, { useState } from "react";
import { ClubIdentity } from "../../club-experience";
import { TablerIcon } from "../ui/TablerIcon";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import "./AuthPage.css";

const AUTH_DESCRIPTION =
  "La plataforma profesional para organizar comunidades, retas y torneos de pádel con ranking, rating e historial.";

const AUTH_FEATURES = [
  {
    icon: "users",
    title: "Comunidades",
    body: "Organiza tu club y jugadores.",
  },
  {
    icon: "trophy",
    title: "Retas y torneos",
    body: "Compite con formato profesional.",
  },
  {
    icon: "chart-bar",
    title: "Ranking y rating",
    body: "Mide tu nivel y sigue tu progreso.",
  },
] as const;

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  return (
    <div className="auth-page ro-surface-dark">
      <div className="auth-visual-panel">
        <div className="auth-visual-panel__photo" />
        <div className="auth-visual-panel__overlay" />
        <div className="auth-visual-panel__grain" />
        <div className="auth-visual-panel__fade" />

        <div className="auth-visual-panel__inner">
          <div className="auth-hero-copy">
            <div className="auth-hero-copy__logo auth-logo">
              <ClubIdentity
                variant="auth"
                logoSurface="dark"
                showTagline={false}
              />
            </div>

            <h1 className="auth-hero-copy__headline">
              <span className="auth-hero-copy__line">Organiza.</span>
              <span className="auth-hero-copy__line">Juega.</span>
              <span className="auth-hero-copy__line">Compite.</span>
            </h1>
            <div className="auth-hero-copy__rule" aria-hidden />
            <p className="auth-hero-copy__subtitle">{AUTH_DESCRIPTION}</p>

            <ul className="auth-hero-features">
              {AUTH_FEATURES.map((feature) => (
                <li key={feature.title} className="auth-hero-features__item">
                  <span className="auth-hero-features__icon" aria-hidden>
                    <TablerIcon name={feature.icon} size={20} />
                  </span>
                  <span className="auth-hero-features__copy">
                    <span className="auth-hero-features__title">
                      {feature.title}
                    </span>
                    <span className="auth-hero-features__body">
                      {feature.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-panel__stack">
          <div className="auth-form-panel__card-wrap">
            {isLoginMode ? (
              <LoginForm onToggleMode={toggleMode} />
            ) : (
              <RegisterForm onToggleMode={toggleMode} />
            )}
          </div>

          <AppSiteFooter className="auth-page-foot" />
        </div>
      </div>
    </div>
  );
};
