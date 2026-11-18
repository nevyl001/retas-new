import React from "react";
import { DashboardActionCard } from "./dashboard/DashboardActionCard";
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
  tablerIcon,
  category,
  disabled,
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
    <DashboardActionCard
      title={title}
      description={description}
      icon={tablerIcon || "ball-tennis"}
      disabled={disabled}
      badge={disabled ? "Upgrade" : undefined}
      onClick={handleClick}
      className={`game-mode-card game-mode-card--${id} game-mode-card--${category}${
        disabled ? " game-mode-card--disabled" : ""
      }`}
    />
  );
};
