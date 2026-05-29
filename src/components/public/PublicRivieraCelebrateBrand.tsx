import React from "react";
import { RIVIERA_APP_TAGLINE } from "../../lib/rivieraBranding";

export const PublicRivieraCelebrateBrand: React.FC<{
  showTagline?: boolean;
}> = ({ showTagline = true }) => (
  <header className="ro-pub-celebrate__brand">
    <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
    <p className="ro-pub-celebrate__wordmark">
      <span>R I V I E R A</span>
      <span className="ro-pub-celebrate__wordmark-sep" aria-hidden>
        ·
      </span>
      <span>O P E N</span>
    </p>
    {showTagline ? (
      <p className="ro-pub-celebrate__brand-tagline">{RIVIERA_APP_TAGLINE}</p>
    ) : null}
    <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
  </header>
);

export const PublicRivieraCelebrateClosing: React.FC<{
  torneoNombre?: string;
}> = ({ torneoNombre }) => (
  <footer className="ro-pub-celebrate__footer">
    <div className="ro-divider-gold" aria-hidden />
    {torneoNombre ? (
      <p className="ro-pub-celebrate__torneo">{torneoNombre}</p>
    ) : null}
    <p className="ro-pub-celebrate__closing">Vive Riviera Open</p>
  </footer>
);
