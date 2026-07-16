import React, { useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import type { GameModeId } from "./gameModesConfig";
import { GAME_MODES } from "./gameModesConfig";
import { ModeHeader } from "../platform/ModeHeader";
import { Button, Modal } from "../ui";
import { RetaConfigFields } from "../reta/RetaConfigFields";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";

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

const DEFAULT_VALUES: RetaConfigFormValues = {
  name: "",
  description: "",
  courts: 2,
  championshipEnabled: false,
  championshipRounds: 2,
  lugar: "",
  mostrar_lugar: true,
  cancha: "",
  programado_en: "",
  duration_minutes: 90,
};

export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({
  modeId,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const [values, setValues] = useState<RetaConfigFormValues>(DEFAULT_VALUES);
  const modeEyebrow = useClubModeEyebrow();

  if (!modeId) return null;

  const mode = GAME_MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const isAmericano = modeId === "americano";
  const isRoundRobin = modeId === "round-robin";

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
                name: values.name.trim() || `Reta ${mode.title}`,
                description: values.description.trim() || undefined,
                courts: values.courts,
                ...(isRoundRobin
                  ? {
                      championshipEnabled: values.championshipEnabled,
                      championshipRounds: values.championshipRounds,
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

      <RetaConfigFields
        mode="create"
        phase="draft"
        values={values}
        onChange={setValues}
        disabled={submitting}
        showChampionship={isRoundRobin}
      />
      {isAmericano ? (
        <p className="home-sheet__field-hint">
          En Americano solo juegan tantos partidos como canchas; el resto
          descansa esa ronda.
        </p>
      ) : null}
    </Modal>
  );
};

export default QuickStartSheet;
