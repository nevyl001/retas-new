import React from "react";
import { PublicShareSection } from "../platform/PublicShareSection";

export type Duelo2v2PublicShareProps = {
  publicUrl: string;
  className?: string;
};

/**
 * Bloque de compartir marcador en vivo, fuera de «Detalles de la reta».
 * Solo se monta cuando el duelo ya está en juego.
 */
export const Duelo2v2PublicShare: React.FC<Duelo2v2PublicShareProps> = ({
  publicUrl,
  className = "",
}) => {
  if (!publicUrl) return null;

  return (
    <section
      className={`duelo2v2-public-share ${className}`.trim()}
      aria-label="Vista pública"
    >
      <PublicShareSection
        publicUrl={publicUrl}
        title="Vista pública"
        infoLines={[
          "El duelo ya está en juego. Comparte el marcador en vivo (solo lectura).",
        ]}
        copyButtonLabel="Copiar vista pública"
        className="duelo2v2-public-share__card"
      />
    </section>
  );
};
