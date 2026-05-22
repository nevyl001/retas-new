import React, { useState } from "react";
import type { GameModeId } from "./gameModesConfig";
import { GAME_MODES } from "./gameModesConfig";
import { Button, Modal } from "../ui";

export interface QuickStartPayload {
  modeId: GameModeId;
  name: string;
  description?: string;
  courts: number;
}

interface QuickStartSheetProps {
  modeId: GameModeId | null;
  onClose: () => void;
  onSubmit: (payload: QuickStartPayload) => void;
  submitting?: boolean;
}

const MIN_COURTS = 1;
const MAX_COURTS = 20;

function clampCourts(value: number): number {
  return Math.min(MAX_COURTS, Math.max(MIN_COURTS, Math.floor(value) || MIN_COURTS));
}

export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({
  modeId,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [courts, setCourts] = useState(1);

  if (!modeId) return null;

  const mode = GAME_MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const isAmericano = modeId === "americano";

  return (
    <Modal
      open
      onClose={onClose}
      sheet
      hideClose
      size="lg"
      overlayClassName="home-sheet-overlay"
      className="home-sheet"
      bodyClassName="home-sheet__body"
      footer={
        <footer className="home-sheet__footer">
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="home-sheet__submit"
            disabled={submitting}
            loading={submitting}
            onClick={() =>
              onSubmit({
                modeId,
                name: name.trim() || `Reta ${mode.title}`,
                description: description.trim() || undefined,
                courts: isAmericano ? 1 : courts,
              })
            }
          >
            {submitting ? "Creando…" : "⚡ Crear y continuar →"}
          </Button>
        </footer>
      }
    >
      <div className="home-sheet__handle" aria-hidden />
      <header className="home-sheet__header">
        <button type="button" className="home-sheet__back" onClick={onClose}>
          ←
        </button>
        <span className="home-sheet__mode-icon">{mode.icon}</span>
        <h2 id="quick-start-title" className="home-sheet__title">
          {mode.title}
        </h2>
      </header>

      <label className="home-sheet__label">
        Nombre de la reta (opcional)
        <input
          type="text"
          className="riviera-input"
          placeholder="Reta del domingo…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </label>

      <label className="home-sheet__label">
        Descripción (opcional)
        <textarea
          className="home-sheet__textarea riviera-textarea riviera-input"
          placeholder="Ej: Reta de verano, grupo de amigos…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          rows={3}
        />
      </label>

      {!isAmericano && (
        <>
          <p className="home-sheet__label">Canchas disponibles</p>
          <div className="home-sheet__courts-stepper">
            <button
              type="button"
              className="home-sheet__courts-step"
              onClick={() => setCourts((c) => clampCourts(c - 1))}
              aria-label="Menos canchas"
            >
              −
            </button>
            <input
              id="home-sheet-courts"
              type="number"
              className="home-sheet__courts-input riviera-input"
              min={MIN_COURTS}
              max={MAX_COURTS}
              value={courts}
              onChange={(e) => setCourts(clampCourts(Number(e.target.value)))}
            />
            <button
              type="button"
              className="home-sheet__courts-step"
              onClick={() => setCourts((c) => clampCourts(c + 1))}
              aria-label="Más canchas"
            >
              +
            </button>
          </div>
        </>
      )}
      <p className="home-sheet__hint">
        {isAmericano
          ? "Las canchas, jugadores y rondas se configuran en el siguiente paso del Americano."
          : "Después podrás añadir jugadores y parejas en la reta. El flujo del modo no cambia."}
      </p>
    </Modal>
  );
};
