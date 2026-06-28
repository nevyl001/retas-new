import React from "react";
import { ModeCard } from "../platform/ModeCard";
import type { GameModeConfig } from "./gameModesConfig";

interface GameModeCardProps extends GameModeConfig {
  index: number;
  onClick: () => void;
}

export const GameModeCard: React.FC<GameModeCardProps> = ({
  id,
  title,
  description,
  icon,
  typeLabel,
  accentColor,
  disabled,
  index,
  onClick,
}) => {
  return (
    <ModeCard
      title={title}
      description={description}
      typeLabel={disabled ? "Upgrade" : typeLabel}
      icon={icon}
      ctaLabel="Iniciar"
      disabled={disabled}
      onClick={onClick}
      className={`game-mode-card game-mode-card--${id}${
        disabled ? " game-mode-card--disabled" : ""
      }`}
      style={
        {
          "--mode-accent": accentColor,
          animationDelay: `${index * 80}ms`,
        } as React.CSSProperties
      }
    >
      {disabled ? (
        <p className="game-mode-card__upgrade">
          ¿Deseas el upgrade del sistema? Contacta al administrador.
        </p>
      ) : null}
    </ModeCard>
  );
};
