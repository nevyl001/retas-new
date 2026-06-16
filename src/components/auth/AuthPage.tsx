import React, { useState } from "react";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { RIVIERA_APP_TAGLINE } from "../../lib/rivieraBranding";
import {
  buildRankingComoFuncionaPath,
} from "../jugadores/jugadoresPublicNav";
import "./AuthPage.css";

/** PNG con transparencia (public/logo-riviera.png) */
const AUTH_LOGO_SRC = "/logo-riviera.png?v=1";

export const AuthPage: React.FC = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const rankingPuntosHref = buildRankingComoFuncionaPath();

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
          <p className="auth-brand-tagline">{RIVIERA_APP_TAGLINE}</p>
          <p className="auth-visual-subtitle">
            Crea retas, gestiona torneos y sigue el ranking de tu grupo.
          </p>
          <p className="auth-visual-proof">Usado por +200 jugadores activos</p>
          <div className="auth-public-links">
            <a className="auth-public-links__item" href={rankingPuntosHref}>
              Cómo funcionan los puntos
            </a>
          </div>
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
          <p className="auth-brand-tagline auth-brand-tagline--hero">
            {RIVIERA_APP_TAGLINE}
          </p>
          <p className="auth-mobile-hero__subtitle">
            Crea retas, gestiona torneos y sigue el ranking.
          </p>
          <p className="auth-mobile-hero__proof">Usado por +200 jugadores activos</p>
          <div className="auth-public-links auth-public-links--mobile">
            <a className="auth-public-links__item" href={rankingPuntosHref}>
              Cómo funcionan los puntos
            </a>
          </div>
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
