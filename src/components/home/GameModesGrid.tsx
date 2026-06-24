import React from "react";
import { GameModeCard } from "./GameModeCard";
import { GAME_MODES, type GameModeId } from "./gameModesConfig";

interface GameModesGridProps {
  onModeSelect: (modeId: GameModeId) => void;
  isModeEnabled?: (modeId: GameModeId) => boolean;
}

export const GameModesGrid: React.FC<GameModesGridProps> = ({
  onModeSelect,
  isModeEnabled,
}) => {
  return (
    <section className="game-modes-section" aria-labelledby="game-modes-heading">
      <h2 id="game-modes-heading" className="home-section-title">
        Modos de juego
      </h2>
      <div className="game-modes-grid">
        {GAME_MODES.map((mode, index) => {
          const enabled = isModeEnabled ? isModeEnabled(mode.id) : true;
          return (
            <GameModeCard
              key={mode.id}
              {...mode}
              index={index}
              disabled={!enabled}
              onClick={() => {
                if (enabled) onModeSelect(mode.id);
              }}
            />
          );
        })}
      </div>
    </section>
  );
};
