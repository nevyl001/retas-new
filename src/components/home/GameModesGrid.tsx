import React, { useMemo } from "react";
import { getDuelo2v2ModeDescription, useBranding } from "../../club-experience";
import { GameModeCard } from "./GameModeCard";
import {
  ORGANIZED_GAME_MODES,
  QUICK_GAME_MODES,
  type GameModeConfig,
  type GameModeId,
} from "./gameModesConfig";

interface GameModesGridProps {
  onModeSelect: (modeId: GameModeId) => void;
  isModeEnabled?: (modeId: GameModeId) => boolean;
}

function renderModeCards(
  modes: GameModeConfig[],
  startIndex: number,
  isModeEnabled: GameModesGridProps["isModeEnabled"],
  onModeSelect: GameModesGridProps["onModeSelect"]
) {
  return modes.map((mode, offset) => {
    const index = startIndex + offset;
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
  });
}

export const GameModesGrid: React.FC<GameModesGridProps> = ({
  onModeSelect,
  isModeEnabled,
}) => {
  const { nombre } = useBranding();
  const quickModes = useMemo(
    () =>
      QUICK_GAME_MODES.map((mode) =>
        mode.id === "duelo-2v2"
          ? { ...mode, description: getDuelo2v2ModeDescription(nombre) }
          : mode
      ),
    [nombre]
  );

  return (
    <div className="game-modes-groups rv-stack rv-stack--lg">
      <section className="game-modes-section" aria-labelledby="game-modes-quick-heading">
        <h2 id="game-modes-quick-heading" className="home-section-title rv-section-title">
          Retas rápidas
        </h2>
        <div className="game-modes-grid rv-grid rv-grid--modes">
          {renderModeCards(quickModes, 0, isModeEnabled, onModeSelect)}
        </div>
      </section>

      <section
        className="game-modes-section"
        aria-labelledby="game-modes-organized-heading"
      >
        <h2
          id="game-modes-organized-heading"
          className="home-section-title rv-section-title"
        >
          Competencias organizadas
        </h2>
        <div className="game-modes-grid rv-grid rv-grid--modes game-modes-grid--organized">
          {renderModeCards(
            ORGANIZED_GAME_MODES,
            QUICK_GAME_MODES.length,
            isModeEnabled,
            onModeSelect
          )}
        </div>
      </section>
    </div>
  );
};
