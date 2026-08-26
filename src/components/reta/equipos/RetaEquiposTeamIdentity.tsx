import React from "react";
import { TeamLogo } from "./TeamLogo";

type RetaEquiposTeamIdentityProps = {
  teamName: string;
  logoUrl?: string | null;
  side?: "a" | "b";
  size?: "hero" | "md" | "sm";
  /** Compacto inline para barras de enfrentamiento. */
  compact?: boolean;
  className?: string;
};

/**
 * Identidad de equipo. Preferir la barra única del hero (`reta-eq-matchbar`);
 * este componente queda para usos compactos / legacy.
 */
export const RetaEquiposTeamIdentity: React.FC<RetaEquiposTeamIdentityProps> = ({
  teamName,
  logoUrl,
  side = "a",
  size = "md",
  compact = false,
  className = "",
}) => {
  return (
    <div
      className={[
        "reta-eq-identity",
        `reta-eq-identity--${side}`,
        compact ? "reta-eq-identity--compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <TeamLogo
        logoUrl={logoUrl}
        teamName={teamName}
        size={compact ? "sm" : size === "hero" ? "md" : size}
        loading="eager"
        className="reta-eq-logo--ring reta-eq-logo--hero-surface"
      />
      <p className="reta-eq-identity__name">{teamName}</p>
    </div>
  );
};
