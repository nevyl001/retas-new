import React, { useState } from "react";
import {
  ClubIdentity,
  getLandingProofLine,
  getLandingSubtitle,
  useClubExperience,
} from "../../club-experience";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import "./AuthPage.css";

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const { manifest } = useClubExperience();

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  const landingSubtitle = getLandingSubtitle(manifest);
  const landingProof = getLandingProofLine(manifest);

  return (
    <div className="auth-page">
      <div className="auth-visual-panel" aria-hidden="true">
        <div className="auth-visual-panel__inner">
          <div className="auth-visual-brand auth-logo">
            <ClubIdentity variant="auth" logoSurface="dark" />
          </div>
          <p className="auth-visual-subtitle">{landingSubtitle}</p>
          <p className="auth-visual-proof">{landingProof}</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div
          className="auth-mobile-hero auth-logo"
          aria-label={manifest.displayName}
        >
          <ClubIdentity variant="auth" logoSurface="dark" />
          <p className="auth-mobile-hero__subtitle">{landingSubtitle}</p>
          <p className="auth-mobile-hero__proof">{landingProof}</p>
        </div>

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
  );
};
