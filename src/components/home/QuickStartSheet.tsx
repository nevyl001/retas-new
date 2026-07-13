import React, { useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import type { GameModeId } from "./gameModesConfig";
import { GAME_MODES } from "./gameModesConfig";
import { ModeHeader } from "../platform/ModeHeader";
import { Button, Modal } from "../ui";

export interface QuickStartPayload {
  modeId: GameModeId;
  name: string;
  description?: string;
  courts: number;
  championshipEnabled?: boolean;
  championshipRounds?: number;
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
  const [courts, setCourts] = useState(2);
  const [championshipEnabled, setChampionshipEnabled] = useState(false);
  const [championshipRounds, setChampionshipRounds] = useState(2);
  const [showRemontadaHelp, setShowRemontadaHelp] = useState(false);
  const modeEyebrow = useClubModeEyebrow();

  if (!modeId) return null;

  const mode = GAME_MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const isAmericano = modeId === "americano";
  const isRoundRobin = modeId === "round-robin";

  const clampChampRounds = (n: number) =>
    Math.min(10, Math.max(1, Math.floor(n) || 2));

  return (
    <Modal
      open
      onClose={onClose}
      hideClose
      size="lg"
      ariaLabelledBy="quick-start-title"
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
                courts,
                ...(isRoundRobin
                  ? {
                      championshipEnabled,
                      championshipRounds: clampChampRounds(championshipRounds),
                    }
                  : {}),
              })
            }
          >
            {submitting ? "Creando reta…" : "Iniciar reta"}
          </Button>
        </footer>
      }
    >
      <header className="home-sheet__header">
        <button
          type="button"
          className="home-sheet__back"
          onClick={onClose}
          aria-label="Volver"
        >
          ←
        </button>
        <ModeHeader
          className="home-sheet__mode-header rv-mode-header rv-mode-header--entry"
          eyebrow={modeEyebrow}
          title={mode.title}
          titleId="quick-start-title"
          subtitle={mode.description}
        />
      </header>

      <div className="home-sheet__fields">
        <label className="home-sheet__field">
          <span className="home-sheet__field-label">Nombre de la reta</span>
          <span className="home-sheet__field-optional">Opcional</span>
          <input
            type="text"
            className="home-sheet__input riviera-input"
            placeholder="Reta del domingo…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="next"
          />
        </label>

        <label className="home-sheet__field">
          <span className="home-sheet__field-label">Descripción</span>
          <span className="home-sheet__field-optional">Opcional</span>
          <textarea
            className="home-sheet__textarea riviera-textarea riviera-input"
            placeholder="Ej: Reta de verano, grupo de amigos…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={2}
            enterKeyHint="done"
          />
        </label>

        <div className="home-sheet__field">
          <span className="home-sheet__field-label">Canchas disponibles</span>
          <div className="home-sheet__courts-stepper">
            <button
              type="button"
              className="home-sheet__courts-step"
              onClick={() => setCourts((c) => clampCourts(c - 1))}
              disabled={courts <= MIN_COURTS}
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
              aria-label="Número de canchas"
            />
            <button
              type="button"
              className="home-sheet__courts-step"
              onClick={() => setCourts((c) => clampCourts(c + 1))}
              disabled={courts >= MAX_COURTS}
              aria-label="Más canchas"
            >
              +
            </button>
          </div>
          {isAmericano ? (
            <p className="home-sheet__field-hint">
              En Americano solo juegan tantos partidos como canchas; el resto
              descansa esa ronda.
            </p>
          ) : null}
        </div>

        {isRoundRobin && (
          <div
            className={`home-sheet__optional${championshipEnabled ? " home-sheet__optional--on" : ""}`}
          >
            <div className="home-sheet__optional-head">
              <div>
                <p className="home-sheet__optional-kicker">Opcional</p>
                <p className="home-sheet__optional-title">Remontada Final</p>
                {!showRemontadaHelp ? (
                  <button
                    type="button"
                    className="home-sheet__optional-link"
                    onClick={() => setShowRemontadaHelp(true)}
                  >
                    ¿Cómo funciona?
                  </button>
                ) : (
                  <p className="home-sheet__optional-sub">
                    Tras el Round Robin: semifinal #1 vs #4 y #2 vs #3; final entre
                    ganadores y partido por 3er lugar entre perdedores.
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={championshipEnabled}
                aria-label="Activar Remontada Final"
                className={`home-sheet__switch${championshipEnabled ? " home-sheet__switch--on" : ""}`}
                onClick={() => setChampionshipEnabled((v) => !v)}
              >
                <span className="home-sheet__switch-thumb" aria-hidden />
              </button>
            </div>
            {championshipEnabled && (
              <div className="home-sheet__optional-extra">
                <span className="home-sheet__optional-extra-lbl">Rondas extra</span>
                <div className="home-sheet__mini-stepper">
                  <button
                    type="button"
                    className="home-sheet__mini-step"
                    onClick={() =>
                      setChampionshipRounds((r) => clampChampRounds(r - 1))
                    }
                    aria-label="Menos rondas"
                  >
                    −
                  </button>
                  <span className="home-sheet__mini-val">{championshipRounds}</span>
                  <button
                    type="button"
                    className="home-sheet__mini-step"
                    onClick={() =>
                      setChampionshipRounds((r) => clampChampRounds(r + 1))
                    }
                    aria-label="Más rondas"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="home-sheet__hint">
        {isAmericano
          ? "Configura jugadores y rondas en el siguiente paso."
          : isRoundRobin
            ? championshipEnabled
              ? "Añade parejas y canchas; la remontada se juega al terminar el Round Robin."
              : "Añade parejas y canchas para generar el calendario."
            : "Después podrás añadir jugadores y parejas."}
      </p>
    </Modal>
  );
};
