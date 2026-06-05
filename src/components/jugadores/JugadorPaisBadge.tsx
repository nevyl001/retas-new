import React from "react";
import {
  countryCodeToFlagEmoji,
  getPaisOption,
} from "../../lib/rivieraJugadores/paises";

interface JugadorPaisBadgeProps {
  codigo: string | null | undefined;
  size?: "sm" | "md";
  showCode?: boolean;
  className?: string;
}

export const JugadorPaisBadge: React.FC<JugadorPaisBadgeProps> = ({
  codigo,
  size = "md",
  showCode = true,
  className = "",
}) => {
  const pais = getPaisOption(codigo);
  if (!pais) return null;

  const flag = countryCodeToFlagEmoji(pais.codigo);
  const rootClass = [
    "rj-pais-badge",
    size === "sm" ? "rj-pais-badge--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={rootClass}
      title={pais.nombre}
      aria-label={`País: ${pais.nombre}`}
    >
      <span className="rj-pais-badge__flag" aria-hidden>
        {flag}
      </span>
      {showCode && (
        <span className="rj-pais-badge__code">{pais.iso3}</span>
      )}
    </span>
  );
};
