import React from "react";
import { ModeCard } from "../platform/ModeCard";
import { TablerIcon } from "../ui/TablerIcon";
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
  tablerIcon,
  accentColor,
  category,
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
      icon={tablerIcon ? <TablerIcon name={tablerIcon} size={20} /> : icon}
      disabled={disabled}
      onClick={handleClick}
      className={`game-mode-card game-mode-card--${id} game-mode-card--${category}${
        disabled ? " game-mode-card--disabled" : ""
      }`}
      style={
        {
          "--mode-accent": accentColor,
          animationDelay: `${index * 60}ms`,
        } as React.CSSProperties
      }
    >
      <TablerIcon
        name="chevron-right"
        size={16}
        className="game-mode-card__chevron"
      />
    </ModeCard>
  );
};
