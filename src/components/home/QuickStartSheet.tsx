import React, { useState } from "react";
import type { GameModeId } from "./gameModesConfig";
import { GAME_MODES } from "./gameModesConfig";

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
    <div className="home-sheet-overlay" role="presentation" onClick={onClose}>
      <div
        className="home-sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="home-sheet__handle" aria-hidden />
        <header className="home-sheet__header">
          <button type="button" className="home-sheet__back" onClick={onClose}>
            ←
          </button>
          <span className="home-sheet__mode-icon">{mode.icon}</span>
          <h2 className="home-sheet__title">{mode.title}</h2>
        </header>

        <div className="home-sheet__body">
          <label className="home-sheet__label">
            Nombre de la reta (opcional)
            <input
              type="text"
              placeholder="Reta del domingo…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </label>

          <label className="home-sheet__label">
            Descripción (opcional)
            <textarea
              className="home-sheet__textarea"
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
              aria-label="Menos canchas"
              disabled={courts <= MIN_COURTS}
              onClick={() => setCourts((c) => clampCourts(c - 1))}
            >
              −
            </button>
            <input
              id="home-sheet-courts"
              type="number"
              className="home-sheet__courts-input"
              min={MIN_COURTS}
              max={MAX_COURTS}
              value={courts}
              onChange={(e) => setCourts(clampCourts(Number(e.target.value)))}
              aria-label="Número de canchas"
            />
            <button
              type="button"
              className="home-sheet__courts-step"
              aria-label="Más canchas"
              disabled={courts >= MAX_COURTS}
              onClick={() => setCourts((c) => clampCourts(c + 1))}
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
        </div>

        <footer className="home-sheet__footer">
          <button
            type="button"
            className="home-sheet__submit"
            disabled={submitting}
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
          </button>
        </footer>
      </div>
    </div>
  );
};
