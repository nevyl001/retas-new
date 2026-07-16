import React, { useMemo, useState } from "react";
import { copyTextToClipboard } from "../../lib/clipboard/copyTextToClipboard";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import "../../styles/public-link-section.css";

export interface PublicShareSectionProps {
  /** URL SPA humana (preview / abrir). */
  publicUrl: string;
  /**
   * URL a copiar para WhatsApp/OG. Si se omite, se deriva con
   * buildSharePublicOgUrlFromPlayUrl(publicUrl).
   */
  shareOgUrl?: string;
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
  shareOgUrl: shareOgUrlProp,
  onCopy,
  title = "Enlace público",
  infoLines = ["Comparte el enlace para ver resultados en vivo (solo lectura)."],
  copyButtonLabel = "Copiar enlace",
  copiedLabel = "Enlace copiado",
  previewLabel = "Ver vista pública",
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (shareOgUrlProp?.trim()) return shareOgUrlProp.trim();
    return buildSharePublicOgUrlFromPlayUrl(publicUrl);
  }, [publicUrl, shareOgUrlProp]);

  if (!publicUrl) return null;

  const handleCopy = async () => {
    if (onCopy) {
      await onCopy();
    } else {
      const toCopy = shareUrl || publicUrl;
      const ok = await copyTextToClipboard(toCopy);
      if (!ok) {
        window.prompt("Copia este enlace:", toCopy);
        return;
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
          <p>{infoLines.join(" ")}</p>
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
