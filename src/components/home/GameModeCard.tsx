import React from "react";
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
  accentColor,
  disabled,
  index,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`game-mode-card game-mode-card--${id}${
        disabled ? " game-mode-card--disabled" : ""
      }`}
      style={
        {
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
        <div className="game-mode-card__badges">
          {disabled ? (
            <span className="game-mode-card__upgrade-badge">Upgrade</span>
          ) : null}
        </div>
      </div>
      <h3 className="game-mode-card__title">{title}</h3>
      <p className="game-mode-card__desc">{description}</p>
      {disabled ? (
        <p className="game-mode-card__upgrade">
          ¿Deseas el upgrade del sistema? Contacta al administrador.
        </p>
      ) : null}
    </button>
  );
};
