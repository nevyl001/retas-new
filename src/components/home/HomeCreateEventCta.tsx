import React, { useState } from "react";
import { getDuelo2v2ModeDescription, useBranding } from "../../club-experience";
import { TablerIcon } from "../ui/TablerIcon";
import {
  GAME_MODES,
  ORGANIZED_GAME_MODES,
  QUICK_GAME_MODES,
  type GameModeId,
} from "./gameModesConfig";

interface HomeCreateEventCtaProps {
  onModeSelect: (modeId: GameModeId) => void;
  isModeEnabled?: (modeId: GameModeId) => boolean;
}

export const HomeCreateEventCta: React.FC<HomeCreateEventCtaProps> = ({
  onModeSelect,
  isModeEnabled,
}) => {
  const { nombre } = useBranding();
  const [pickerOpen, setPickerOpen] = useState(false);

  const modes = React.useMemo(
    () =>
      GAME_MODES.map((mode) =>
        mode.id === "duelo-2v2"
          ? { ...mode, description: getDuelo2v2ModeDescription(nombre) }
          : mode
      ),
    [nombre]
  );

  const handleSelect = (modeId: GameModeId) => {
    const enabled = isModeEnabled ? isModeEnabled(modeId) : true;
    if (!enabled) return;
    setPickerOpen(false);
    onModeSelect(modeId);
  };

  return (
    <section className="home-create-event" aria-label="Crear evento">
      <button
        type="button"
        className="home-create-event__cta riviera-btn riviera-btn-primary riviera-btn--lg"
        onClick={() => setPickerOpen((open) => !open)}
        aria-expanded={pickerOpen}
        aria-controls="home-create-event-picker"
      >
        <TablerIcon name="plus" size={20} aria-hidden />
        Crear evento
      </button>

      {pickerOpen ? (
        <div
          id="home-create-event-picker"
          className="home-create-event__picker"
          role="listbox"
          aria-label="Seleccionar modalidad"
        >
          <p className="home-create-event__picker-hint">
            Elige la modalidad para tu evento
          </p>
          <div className="home-create-event__picker-groups">
            <div className="home-create-event__picker-group">
              <span className="home-create-event__picker-label">Retas rápidas</span>
              <ul className="home-create-event__picker-list" role="presentation">
                {QUICK_GAME_MODES.map((mode) => {
                  const full = modes.find((m) => m.id === mode.id)!;
                  const enabled = isModeEnabled ? isModeEnabled(mode.id) : true;
                  return (
                    <li key={mode.id}>
                      <button
                        type="button"
                        role="option"
                        className="home-create-event__picker-item"
                        disabled={!enabled}
                        onClick={() => handleSelect(mode.id)}
                      >
                        <span className="home-create-event__picker-icon" aria-hidden>
                          {full.icon}
                        </span>
                        <span className="home-create-event__picker-text">
                          <span className="home-create-event__picker-name">
                            {full.title}
                          </span>
                          <span className="home-create-event__picker-desc">
                            {full.description}
                          </span>
                        </span>
                        <TablerIcon
                          name="chevron-right"
                          size={18}
                          className="home-create-event__picker-chev"
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="home-create-event__picker-group">
              <span className="home-create-event__picker-label">
                Competencias organizadas
              </span>
              <ul className="home-create-event__picker-list" role="presentation">
                {ORGANIZED_GAME_MODES.map((mode) => {
                  const full = modes.find((m) => m.id === mode.id)!;
                  const enabled = isModeEnabled ? isModeEnabled(mode.id) : true;
                  return (
                    <li key={mode.id}>
                      <button
                        type="button"
                        role="option"
                        className="home-create-event__picker-item"
                        disabled={!enabled}
                        onClick={() => handleSelect(mode.id)}
                      >
                        <span className="home-create-event__picker-icon" aria-hidden>
                          {full.icon}
                        </span>
                        <span className="home-create-event__picker-text">
                          <span className="home-create-event__picker-name">
                            {full.title}
                          </span>
                          <span className="home-create-event__picker-desc">
                            {full.description}
                          </span>
                        </span>
                        <TablerIcon
                          name="chevron-right"
                          size={18}
                          className="home-create-event__picker-chev"
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
