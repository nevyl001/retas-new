import React from "react";
import { ModeCard } from "../platform/ModeCard";
import type { GameModeConfig } from "./gameModesConfig";
import { UNLOCK_GAME_MODES_WHATSAPP_URL } from "./unlockGameModesWhatsApp";

interface GameModeCardProps extends GameModeConfig {
  index: number;
  onClick: () => void;
}

export const GameModeCard: React.FC<GameModeCardProps> = ({
  id,
  title,
  description,
  icon,
  accentColor,
  disabled,
  index,
  onClick,
}) => {
  const handleClick = () => {
    if (disabled) {
      window.open(UNLOCK_GAME_MODES_WHATSAPP_URL, "_blank", "noopener,noreferrer");
      return;
    }
    onClick();
  };

  return (
    <ModeCard
      title={title}
      description={description}
      typeLabel={disabled ? "Upgrade" : undefined}
      icon={icon}
      disabled={disabled}
      onClick={handleClick}
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
        <span className="game-mode-card__upgrade">
          ¿Deseas el upgrade del sistema? Contacta al administrador por WhatsApp.
        </span>
      ) : null}
    </ModeCard>
  );
};
