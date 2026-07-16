import React from "react";
import {
  PublicEventBrandIdentity,
  useClubExperience,
  useOrganizerDisplayName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
} from "../../club-experience";

/**
 * Cabecera de celebración en vistas públicas.
 * - Pending: no pinta marca (anti-flash).
 * - Premium (anfitrión): identidad del club + atribución Riviera.
 * - Básico: wordmark Riviera Open.
 */
export const PublicRivieraCelebrateBrand: React.FC<{
  showTagline?: boolean;
  showClubIdentity?: boolean;
}> = ({ showTagline = true, showClubIdentity = true }) => {
  const { isClubBranded, isScopeBrandingReady, brandingStatus, manifest } =
    useClubExperience();
  const organizerName = useOrganizerDisplayName();

  if (!isScopeBrandingReady || brandingStatus === "pending") {
    return (
      <header className="ro-pub-celebrate__brand">
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
      </header>
    );
  }

  if (isClubBranded) {
    return (
      <header className="ro-pub-celebrate__brand">
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
        {showClubIdentity ? (
          <PublicEventBrandIdentity className="ro-pub-celebrate__club-identity" />
        ) : null}
        {organizerName ? (
          <p className="ro-pub-celebrate__wordmark">
            <span>{organizerName}</span>
          </p>
        ) : null}
        {showTagline ? (
          <p className="ro-pub-celebrate__brand-tagline">
            {manifest.slogans.primary}
          </p>
        ) : null}
        <p className="ro-pub-celebrate__brand-tagline" style={{ opacity: 0.75 }}>
          {RIVIERA_CO_BRAND_ATTRIBUTION}
        </p>
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
      </header>
    );
  }

  return (
    <header className="ro-pub-celebrate__brand">
      <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
      {showClubIdentity ? (
        <PublicEventBrandIdentity className="ro-pub-celebrate__club-identity" />
      ) : null}
      <p className="ro-pub-celebrate__wordmark">
        <span>R I V I E R A</span>
        <span className="ro-pub-celebrate__wordmark-sep" aria-hidden>
          ·
        </span>
        <span>O P E N</span>
      </p>
      {showTagline ? (
        <p className="ro-pub-celebrate__brand-tagline">
          {manifest.slogans.primary}
        </p>
      ) : null}
      <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
    </header>
  );
};

export const PublicRivieraCelebrateClosing: React.FC<{
  torneoNombre?: string;
}> = ({ torneoNombre }) => {
  const { isClubBranded, isScopeBrandingReady, brandingStatus } =
    useClubExperience();
  const organizerName = useOrganizerDisplayName();

  const closing =
    !isScopeBrandingReady || brandingStatus === "pending"
      ? ""
      : isClubBranded
        ? RIVIERA_CO_BRAND_ATTRIBUTION
        : `Vive ${RIVIERA_PRODUCT_NAME}`;

  return (
    <footer className="ro-pub-celebrate__footer">
      <div className="ro-divider-gold" aria-hidden />
      {torneoNombre ? (
        <p className="ro-pub-celebrate__torneo">{torneoNombre}</p>
      ) : null}
      {isClubBranded && organizerName ? (
        <p className="ro-pub-celebrate__torneo">{organizerName}</p>
      ) : null}
      {closing ? (
        <p className="ro-pub-celebrate__closing">{closing}</p>
      ) : null}
    </footer>
  );
};
