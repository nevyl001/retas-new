import React, { useEffect, useRef, useState } from "react";
import { getDuelo2v2ModeDescription, useBranding } from "../../club-experience";
import { TablerIcon } from "../ui/TablerIcon";
import {
  GAME_MODES,
  ORGANIZED_GAME_MODES,
  QUICK_GAME_MODES,
  type GameModeId,
} from "./gameModesConfig";
import { UNLOCK_GAME_MODES_WHATSAPP_URL } from "./unlockGameModesWhatsApp";

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
  const rootRef = useRef<HTMLDivElement>(null);

  const modes = React.useMemo(
    () =>
      GAME_MODES.map((mode) =>
        mode.id === "duelo-2v2"
          ? { ...mode, description: getDuelo2v2ModeDescription(nombre) }
          : mode
      ),
    [nombre]
  );

  const closePicker = () => setPickerOpen(false);

  useEffect(() => {
    if (!pickerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker();
    };

    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        closePicker();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pickerOpen]);

  const handleSelect = (modeId: GameModeId) => {
    const enabled = isModeEnabled ? isModeEnabled(modeId) : true;
    if (!enabled) return;
    setPickerOpen(false);
    onModeSelect(modeId);
  };

  /**
   * Modos bloqueados: en vez de quedar inertes (disabled), el click abre
   * WhatsApp directo con el administrador para solicitar el desbloqueo —
   * mismo mensaje/número que GameModeCard (grid de inicio).
   */
  const handleItemClick = (modeId: GameModeId, enabled: boolean) => {
    if (!enabled) {
      window.open(UNLOCK_GAME_MODES_WHATSAPP_URL, "_blank", "noopener,noreferrer");
      return;
    }
    handleSelect(modeId);
  };

  return (
    <>
      {pickerOpen ? (
        <div
          className="home-create-event__backdrop"
          aria-hidden
          onClick={closePicker}
        />
      ) : null}
      <div
        ref={rootRef}
        className={[
          "home-create-event",
          pickerOpen ? "home-create-event--open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Crear evento"
      >
        <button
          type="button"
          className={[
            "home-create-event__cta",
            "riviera-btn",
            pickerOpen ? "riviera-btn-secondary" : "riviera-btn-primary",
            "riviera-btn--md",
          ].join(" ")}
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          aria-controls="home-create-event-picker"
          aria-label={
            pickerOpen ? "Cerrar selector de modalidades" : "Nuevo evento"
          }
        >
          <TablerIcon name={pickerOpen ? "x" : "plus"} size={18} aria-hidden />
          {pickerOpen ? "Cerrar" : "Nuevo evento"}
        </button>

        {pickerOpen ? (
          <div
            id="home-create-event-picker"
            className="home-create-event__picker"
            aria-label="Seleccionar modalidad"
          >
            <p className="home-create-event__picker-hint">
              Elige la modalidad para tu evento
            </p>
            <div className="home-create-event__picker-groups">
              <div className="home-create-event__picker-group">
                <span className="home-create-event__picker-label">
                  Retas rápidas
                </span>
                <ul className="home-create-event__picker-list" role="presentation">
                  {QUICK_GAME_MODES.map((mode) => {
                    const full = modes.find((m) => m.id === mode.id)!;
                    const enabled = isModeEnabled ? isModeEnabled(mode.id) : true;
                    return (
                      <li key={mode.id}>
                        <button
                          type="button"
                          className={`home-create-event__picker-item${
                            enabled ? "" : " home-create-event__picker-item--locked"
                          }`}
                          aria-label={
                            enabled
                              ? undefined
                              : `${full.title} — bloqueado, contactar administrador por WhatsApp`
                          }
                          onClick={() => handleItemClick(mode.id, enabled)}
                        >
                          <span
                            className="home-create-event__picker-icon"
                            aria-hidden
                          >
                            {full.icon}
                          </span>
                          <span className="home-create-event__picker-text">
                            <span className="home-create-event__picker-name">
                              {full.title}
                            </span>
                            <span className="home-create-event__picker-desc">
                              {enabled
                                ? full.description
                                : "Bloqueado · toca para desbloquear por WhatsApp"}
                            </span>
                          </span>
                          <TablerIcon
                            name={enabled ? "chevron-right" : "brand-whatsapp"}
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
                          className={`home-create-event__picker-item${
                            enabled ? "" : " home-create-event__picker-item--locked"
                          }`}
                          aria-label={
                            enabled
                              ? undefined
                              : `${full.title} — bloqueado, contactar administrador por WhatsApp`
                          }
                          onClick={() => handleItemClick(mode.id, enabled)}
                        >
                          <span
                            className="home-create-event__picker-icon"
                            aria-hidden
                          >
                            {full.icon}
                          </span>
                          <span className="home-create-event__picker-text">
                            <span className="home-create-event__picker-name">
                              {full.title}
                            </span>
                            <span className="home-create-event__picker-desc">
                              {enabled
                                ? full.description
                                : "Bloqueado · toca para desbloquear por WhatsApp"}
                            </span>
                          </span>
                          <TablerIcon
                            name={enabled ? "chevron-right" : "brand-whatsapp"}
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
      </div>
    </>
  );
};
