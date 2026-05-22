import React from "react";
import { Button } from "../../ui";

export const PublicTorneoExpressHeader: React.FC<{
  torneoNombre: string;
  categoria?: string | null;
  subtitle?: React.ReactNode;
  grupoLabel?: string;
  onCopyLink?: () => void;
  copyMsg?: string;
  extraActions?: React.ReactNode;
}> = ({
  torneoNombre,
  categoria,
  subtitle,
  grupoLabel,
  onCopyLink,
  copyMsg,
  extraActions,
}) => (
  <header className="te-public-header te-pub-fade-in">
    <div className="te-public-header__brand">
      <p className="te-public-header__kicker te-label-eyebrow">Riviera Open</p>
      <h1 className="te-public-header__title">{torneoNombre}</h1>
      <div className="te-public-header__line" aria-hidden />
      <div className="te-public-header__meta">
        {categoria?.trim() ? (
          <span className="te-public-header__categoria-pill">{categoria.trim()}</span>
        ) : null}
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
        <Button type="button" variant="secondary" size="sm" onClick={onCopyLink}>
          Copiar enlace
        </Button>
      )}
    </div>
    {copyMsg && <p className="te-public-header__copy-msg">{copyMsg}</p>}
  </header>
);
