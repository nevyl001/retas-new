import React from "react";

export const PublicTorneoExpressHeader: React.FC<{
  torneoNombre: string;
  subtitle?: React.ReactNode;
  grupoLabel?: string;
  onCopyLink?: () => void;
  copyMsg?: string;
  extraActions?: React.ReactNode;
}> = ({
  torneoNombre,
  subtitle,
  grupoLabel,
  onCopyLink,
  copyMsg,
  extraActions,
}) => (
  <header className="te-public-header te-pub-fade-in">
    <div className="te-public-header__brand">
      <p className="te-public-header__kicker">Torneo Express</p>
      <h1 className="te-public-header__title">{torneoNombre}</h1>
      <div className="te-public-header__line" aria-hidden />
      <div className="te-public-header__meta">
        {grupoLabel && (
          <span className="te-public-header__grupo-pill">{grupoLabel}</span>
        )}
        {subtitle && (
          <span className="te-public-header__subtitle">{subtitle}</span>
        )}
      </div>
    </div>
    <div className="te-public-header__actions">
      {extraActions}
      {onCopyLink && (
        <button
          type="button"
          className="te-public-btn te-public-btn--outline"
          onClick={onCopyLink}
        >
          Copiar enlace
        </button>
      )}
    </div>
    {copyMsg && <p className="te-public-header__copy-msg">{copyMsg}</p>}
  </header>
);
