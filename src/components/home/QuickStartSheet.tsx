import React, { useMemo, useState } from "react";
import { useClubModeEyebrow, useConvocatoriaOriginName } from "../../club-experience";
import type { GameModeId } from "./gameModesConfig";
import { GAME_MODES } from "./gameModesConfig";
import { ModeHeader } from "../platform/ModeHeader";
import { ActionBar } from "../platform/ActionBar";
import { Button } from "../ui";
import { RetaConfigFields } from "../reta/RetaConfigFields";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";

export interface QuickStartPayload {
  modeId: GameModeId;
  name: string;
  description?: string;
  courts: number;
  championshipEnabled?: boolean;
  championshipRounds?: number;
  /** Valores completos de Detalles (horario, nivel, lugar, etc.). */
  values: RetaConfigFormValues;
}

interface QuickStartSheetProps {
  modeId: GameModeId | null;
  onClose: () => void;
  onSubmit: (payload: QuickStartPayload) => void;
  submitting?: boolean;
}

function defaultScheduleLocal(): { programado_en: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  return { programado_en: `${y}-${m}-${d}T15:00` };
}

/**
 * Alta de reta: pantalla de Detalles (mismo formulario que en prep).
 * No escribe en BD hasta Guardar; Volver cancela sin crear.
 */
export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({
  modeId,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const modeEyebrow = useClubModeEyebrow();
  const lugarDefault = useConvocatoriaOriginName();
  const initialValues = useMemo<RetaConfigFormValues>(
    () => ({
      name: "",
      description: "",
      nivel: "",
      courts: 2,
      championshipEnabled: false,
      championshipRounds: 2,
      lugar: lugarDefault || "",
      mostrar_lugar: true,
      cancha: "",
      ...defaultScheduleLocal(),
      duration_minutes: 90,
    }),
    [lugarDefault]
  );
  const [values, setValues] = useState<RetaConfigFormValues>(initialValues);

  if (!modeId) return null;

  const mode = GAME_MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const isAmericano = modeId === "americano";
  const isRoundRobin = modeId === "round-robin";

  const handleSave = () => {
    onSubmit({
      modeId,
      name: values.name.trim() || `Reta ${mode.title}`,
      description: values.description.trim() || undefined,
      courts: values.courts,
      values: {
        ...values,
        name: values.name.trim() || `Reta ${mode.title}`,
      },
      ...(isRoundRobin
        ? {
            championshipEnabled: values.championshipEnabled,
            championshipRounds: values.championshipRounds,
          }
        : {}),
    });
  };

  return (
    <div className="home-create-details rv-page">
      <ActionBar className="riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          disabled={submitting}
          onClick={onClose}
        >
          ← Volver al inicio
        </Button>
      </ActionBar>

      <ModeHeader
        className="rv-mode-header rv-mode-header--entry home-create-details__header"
        eyebrow={modeEyebrow}
        title={mode.title}
        titleId="quick-start-title"
        subtitle={mode.description}
      />

      <div className="qm-ws__details-inline home-create-details__panel">
        <div className="reta-config-panel reta-config-panel--inline">
          <header className="reta-config-panel__toolbar">
            <div className="reta-config-panel__toolbar-copy">
              <h2 className="reta-config-panel__title">Detalles de la reta</h2>
              <p className="reta-config-panel__subtitle">
                Completa y guarda para crear la reta. Si sales sin guardar, no se
                crea nada.
              </p>
            </div>
            <div className="reta-config-panel__actions">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={submitting}
                loading={submitting}
                onClick={handleSave}
              >
                {submitting ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </header>

          <RetaConfigFields
            mode="create"
            phase="draft"
            layout="essentials"
            values={values}
            onChange={setValues}
            disabled={submitting}
            showChampionship={isRoundRobin}
          />

          {isAmericano ? (
            <p className="home-sheet__field-hint" role="note">
              En Americano solo juegan tantos partidos como canchas; el resto
              descansa esa ronda.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default QuickStartSheet;
