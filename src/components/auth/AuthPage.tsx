import React, { useState } from "react";
import {
  ClubIdentity,
  getLandingProofLine,
  useClubExperience,
} from "../../club-experience";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import "./AuthPage.css";

const AUTH_SUBTITLE =
  "Retas, torneos y ranking oficial en un solo lugar.";

const AUTH_MARKERS = [
  { key: "torneos", title: "Torneos", desc: "Ligas y express" },
  { key: "ranking", title: "Ranking Oficial", desc: "Posición y puntos" },
  { key: "retas", title: "Retas", desc: "Round robin y equipos" },
  { key: "stats", title: "Estadísticas", desc: "Historial y rating" },
] as const;

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const { manifest } = useClubExperience();

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  const landingProof = getLandingProofLine(manifest);
  const isRivieraPremium = manifest.brandingKey !== "hack-padel";

  return (
    <div
      className={`auth-page${isRivieraPremium ? " auth-page--riviera-premium" : ""}`}
    >
      <div className="auth-visual-panel">
        <div className="auth-visual-panel__photo" />
        <div className="auth-visual-panel__overlay" />
        <div className="auth-visual-panel__grain" />
        <div className="auth-visual-panel__fade" />

        <div className="auth-visual-panel__inner">
          <div className="auth-hero-copy">
            <div className="auth-hero-copy__logo auth-logo">
              <ClubIdentity variant="auth" logoSurface="dark" />
            </div>

            <h1 className="auth-hero-copy__headline">
              Cada partido
              <br />
              cuenta.
            </h1>

            <p className="auth-hero-copy__subtitle">{AUTH_SUBTITLE}</p>

            <ul className="auth-hero-copy__markers">
              {AUTH_MARKERS.map((marker) => (
                <li key={marker.key} className="auth-hero-copy__marker">
                  <span className="auth-hero-copy__marker-title">
                    {marker.title}
                  </span>
                  <span className="auth-hero-copy__marker-desc">
                    {marker.desc}
                  </span>
                </li>
              ))}
            </ul>

            <p className="auth-hero-copy__proof">{landingProof}</p>
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
