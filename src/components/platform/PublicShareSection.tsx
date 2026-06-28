import React, { useState } from "react";

export interface PublicShareSectionProps {
  publicUrl: string;
  onCopy?: () => void | Promise<void>;
  title?: string;
  infoLines?: string[];
  copyButtonLabel?: string;
  copiedLabel?: string;
  previewLabel?: string;
  className?: string;
}

export const PublicShareSection: React.FC<PublicShareSectionProps> = ({
  publicUrl,
  onCopy,
  title = "Enlace público",
  infoLines = [
    "Comparte este enlace con los participantes para que vean los resultados en tiempo real.",
    "Los participantes solo podrán ver los resultados, no podrán editar nada.",
  ],
  copyButtonLabel = "Copiar enlace",
  copiedLabel = "Enlace copiado",
  previewLabel = "Ver vista pública",
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  if (!publicUrl) return null;

  const handleCopy = async () => {
    if (onCopy) {
      await onCopy();
    } else {
      try {
        await navigator.clipboard.writeText(publicUrl);
      } catch {
        window.prompt("Copia este enlace:", publicUrl);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`public-link-section rv-card ${className}`.trim()}>
      <h3>{title}</h3>
      {infoLines.length > 0 ? (
        <div className="public-link-info">
          {infoLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      <div className="public-link-actions">
        <button
          type="button"
          className="public-link-button"
          onClick={() => void handleCopy()}
        >
          {copied ? copiedLabel : copyButtonLabel}
        </button>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="public-link-preview"
        >
          {previewLabel}
        </a>
      </div>
    </div>
  );
};
