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

function usePresentedModes(): { quick: GameModeConfig[]; organized: GameModeConfig[] } {
  const { nombre } = useBranding();
  return useMemo(
    () => ({
      quick: QUICK_GAME_MODES.map((mode) =>
        mode.id === "duelo-2v2"
          ? { ...mode, description: getDuelo2v2ModeDescription(nombre) }
          : mode
      ),
      organized: ORGANIZED_GAME_MODES,
    }),
    [nombre]
  );
}

function ModeCards({
  modes,
  startIndex,
  isModeEnabled,
  onModeSelect,
}: {
  modes: GameModeConfig[];
  startIndex: number;
  isModeEnabled?: (modeId: GameModeId) => boolean;
  onModeSelect: (modeId: GameModeId) => void;
}) {
  return (
    <>
      {modes.map((mode, offset) => {
        const enabled = isModeEnabled ? isModeEnabled(mode.id) : true;
        return (
          <GameModeCard
            key={mode.id}
            {...mode}
            index={startIndex + offset}
            disabled={!enabled}
            onClick={() => onModeSelect(mode.id)}
          />
        );
      })}
    </>
  );
}

export const OrganizeModes: React.FC<GameModesGridProps> = (props) => {
  const { quick } = usePresentedModes();
  return (
    <section className="ops-section" aria-labelledby="ops-organize-title">
      <h2 id="ops-organize-title">Organiza una actividad</h2>
      <div className="ops-grid ops-grid--primary">
        <ModeCards modes={quick} startIndex={0} {...props} />
      </div>
    </section>
  );
};

export const CompetitionModes: React.FC<GameModesGridProps> = (props) => {
  const { organized } = usePresentedModes();
  return (
    <section className="ops-section" aria-labelledby="ops-competitions-title">
      <h2 id="ops-competitions-title">Competencias</h2>
      <div className="ops-grid ops-grid--competitions">
        <ModeCards modes={organized} startIndex={QUICK_GAME_MODES.length} {...props} />
      </div>
    </section>
  );
};
