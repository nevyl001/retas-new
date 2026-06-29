import React, { useState } from "react";
import {
  BrandSignature,
  getAuthProof,
  getAuthSubtitle,
  useBrand,
} from "../../branding";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { AppSiteFooter } from "../legal/AppSiteFooter";
import "./AuthPage.css";

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const { brand } = useBrand();

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  const authSubtitle = getAuthSubtitle(brand);
  const authProof = getAuthProof(brand);

  return (
    <div className="auth-page">
      <div className="auth-visual-panel" aria-hidden="true">
        <div className="auth-visual-panel__inner">
          <div className="auth-visual-brand auth-logo">
            <BrandSignature variant="auth" logoSurface="dark" />
          </div>
          <p className="auth-visual-subtitle">{authSubtitle}</p>
          <p className="auth-visual-proof">{authProof}</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div
          className="auth-mobile-hero auth-logo"
          aria-label={brand.displayName}
        >
          <BrandSignature variant="auth" logoSurface="dark" />
          <p className="auth-mobile-hero__subtitle">{authSubtitle}</p>
          <p className="auth-mobile-hero__proof">{authProof}</p>
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
