import React from "react";
import { GameModeCard } from "./GameModeCard";
import { GAME_MODES, type GameModeId } from "./gameModesConfig";

interface GameModesGridProps {
  onModeSelect: (modeId: GameModeId) => void;
}

export const GameModesGrid: React.FC<GameModesGridProps> = ({ onModeSelect }) => {
  return (
    <section className="game-modes-section" aria-labelledby="game-modes-heading">
      <h2 id="game-modes-heading" className="home-section-title">
        Modos de juego
      </h2>
      <div className="game-modes-grid">
        {GAME_MODES.map((mode, index) => (
          <GameModeCard
            key={mode.id}
            {...mode}
            index={index}
            onClick={() => onModeSelect(mode.id)}
          />
        ))}
      </div>
    </section>
  );
};
