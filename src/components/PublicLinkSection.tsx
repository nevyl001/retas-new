import React from "react";
import { Tournament } from "../lib/database";

interface PublicLinkSectionProps {
  tournament: Tournament;
  onCopyPublicLink: (tournamentId: string) => void;
  generatePublicLink: (tournamentId: string) => string;
}

export const PublicLinkSection: React.FC<PublicLinkSectionProps> = ({
  tournament,
  onCopyPublicLink,
  generatePublicLink,
}) => {
  if (!tournament.is_started) return null;

  return (
    <div className="public-link-section">
      <h3>🔗 Enlace Público</h3>
      <div className="public-link-info">
        <p>
          Comparte este enlace con los participantes para que vean los
          resultados en tiempo real
        </p>
        <p>
          Los participantes solo podrán ver los resultados, no podrán editar
          nada
        </p>
      </div>
      <div className="public-link-actions">
        <button
          className="public-link-button"
          onClick={() => onCopyPublicLink(tournament.id)}
        >
          📋 Copiar Enlace
        </button>
        <a
          href={generatePublicLink(tournament.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="public-link-preview"
        >
          👁️ Ver Vista Pública
        </a>
      </div>
    </div>
  );
};

export default PublicLinkSection;
