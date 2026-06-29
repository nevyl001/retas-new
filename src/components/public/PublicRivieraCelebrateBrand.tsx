import React from "react";
import { ClubIdentity, useClubExperience } from "../../club-experience";
import { getMotherAttributionLine } from "../../club-experience/experienceFormatters";

export const PublicRivieraCelebrateBrand: React.FC<{
  showTagline?: boolean;
}> = ({ showTagline = true }) => {
  const { manifest, isClubBranded } = useClubExperience();

  if (isClubBranded) {
    return (
      <header className="ro-pub-celebrate__brand">
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
        <ClubIdentity
          variant="compact"
          showTagline={showTagline}
          logoSurface="dark"
          className="ro-pub-celebrate__club-identity"
        />
        <div className="ro-divider-gold ro-divider-gold--wide" aria-hidden />
      </header>
    );
  }

  return (
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
  const { manifest, isClubBranded } = useClubExperience();
  const closing = isClubBranded
    ? `${manifest.displayName} ${getMotherAttributionLine(manifest)}`
    : "Vive Riviera Open";

  return (
    <footer className="ro-pub-celebrate__footer">
      <div className="ro-divider-gold" aria-hidden />
      {torneoNombre ? (
        <p className="ro-pub-celebrate__torneo">{torneoNombre}</p>
      ) : null}
      <p className="ro-pub-celebrate__closing">{closing}</p>
    </footer>
  );
};
