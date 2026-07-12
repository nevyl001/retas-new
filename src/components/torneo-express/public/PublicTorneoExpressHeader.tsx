import React from "react";
import {
  useClubExperience,
  useOrganizerDisplayName,
} from "../../../club-experience";
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
}) => {
  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName();

  return (
    <header className="te-public-header te-pub-fade-in">
      <div className="te-public-header__brand">
        {isClubBranded ? (
          <p className="te-public-header__kicker te-label-eyebrow">
            {organizerName}
          </p>
        ) : null}
        <h1 className="te-public-header__title">{torneoNombre}</h1>
        <div className="te-public-header__line" aria-hidden />
        <div className="te-public-header__meta">
          {categoria?.trim() ? (
            <span className="te-public-header__categoria-pill">
              {categoria.trim()}
            </span>
          ) : null}
          {grupoLabel && (
            <span className="te-public-header__grupo-pill">{grupoLabel}</span>
          )}
          {subtitle && (
            <span className="te-public-header__subtitle">{subtitle}</span>
          )}
        </div>
      </div>
      {(onCopyLink || extraActions) && (
        <div className="te-public-header__actions">
          {onCopyLink && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCopyLink}
            >
              {copyMsg || "Copiar enlace"}
            </Button>
          )}
          {extraActions}
        </div>
      )}
    </header>
  );
};
