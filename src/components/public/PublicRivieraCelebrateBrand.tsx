import React from "react";
import {
  PublicEventBrandIdentity,
  useClubExperience,
  RIVIERA_PRODUCT_NAME,
} from "../../club-experience";

/**
 * Cabecera de celebración en vistas públicas.
 * - Pending: no pinta marca (anti-flash).
 * - Vista pública SIEMPRE es genérica (2026-08-08, sin white label): mismo
 *   wordmark Riviera Open para todas las cuentas, tengan o no upgrade de
 *   branding. `PublicEventBrandIdentity` ya se encarga de mostrar el logo de
 *   Riviera Open + el nombre de la cuenta como texto (nunca el logo propio
 *   del club en superficies públicas).
 */
export const PublicRivieraCelebrateBrand: React.FC<{
  showTagline?: boolean;
  showClubIdentity?: boolean;
  /** Solo logo Riviera Open (sin nombre de cuenta). */
  logoOnly?: boolean;
  /** Sustituye el slogan del manifest (p. ej. podio Americano). */
  tagline?: string;
}> = ({
  showTagline = true,
  showClubIdentity = true,
  logoOnly = false,
  tagline,
}) => {
  const { isScopeBrandingReady, brandingStatus, manifest } =
    useClubExperience();

  if (!isScopeBrandingReady || brandingStatus === "pending") {
    return (
      <header className="ro-pub-celebrate__brand">
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
      </header>
    );
  }

  return (
    <header className="ro-pub-celebrate__brand">
      <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
      {showClubIdentity ? (
        <PublicEventBrandIdentity
          className="ro-pub-celebrate__club-identity"
          logoOnly={logoOnly}
        />
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
          {tagline ?? manifest.slogans.primary}
        </p>
      ) : null}
      <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
    </header>
  );
};

export const PublicRivieraCelebrateClosing: React.FC<{
  torneoNombre?: string;
}> = ({ torneoNombre }) => {
  const { isScopeBrandingReady, brandingStatus } = useClubExperience();

  const closing =
    !isScopeBrandingReady || brandingStatus === "pending"
      ? ""
      : `Vive ${RIVIERA_PRODUCT_NAME}`;

  return (
    <footer className="ro-pub-celebrate__footer">
      <div className="ro-divider-gold" aria-hidden />
      {torneoNombre ? (
        <p className="ro-pub-celebrate__torneo">{torneoNombre}</p>
      ) : null}
      {closing ? (
        <p className="ro-pub-celebrate__closing">{closing}</p>
      ) : null}
    </footer>
  );
};
