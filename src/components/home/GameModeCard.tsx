import React from "react";
import type { GameModeConfig } from "./gameModesConfig";

interface GameModeCardProps extends GameModeConfig {
  index: number;
  onClick: () => void;
}

export const GameModeCard: React.FC<GameModeCardProps> = ({
  title,
  description,
  icon,
  badge,
  gradient,
  accentColor,
  disabled,
  index,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`game-mode-card${disabled ? " game-mode-card--disabled" : ""}`}
      style={
        {
          background: gradient,
          "--mode-accent": accentColor,
          animationDelay: `${index * 80}ms`,
        } as React.CSSProperties
      }
      onClick={onClick}
      disabled={disabled}
    >
      <div className="game-mode-card__top">
        <span className="game-mode-card__icon" aria-hidden>
          {icon}
        </span>
        {badge && <span className="game-mode-card__badge">{badge}</span>}
      </div>
      <h3 className="game-mode-card__title">{title}</h3>
      <p className="game-mode-card__desc">{description}</p>
    </button>
  );
};
