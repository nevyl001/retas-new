import React, { useEffect, useMemo, useState } from "react";
import type { TorneoExpressBundle } from "../../lib/torneoExpress/types";
import { buildScheduleMatchesFromBundle } from "../../lib/torneoExpress/draftScheduleMatch";
import {
  inferScheduleDraftFromPartidos,
  type TeScheduleDraft,
} from "../../lib/torneoExpress/inferScheduleDraftFromPartidos";
import {
  courtsForScheduleDay,
  validatePlayDays,
  type TeScheduleDayWindow,
} from "../../lib/torneoExpress/scheduleDayWindows";
import { validateScheduleInvariants } from "../../lib/torneoExpress/scheduleInvariants";
import { PARTIDO_CANCHA_OCUPADA_MSG } from "../../lib/torneoExpress/partidoCourtSlotConflict";
import type { TeOccupiedCourtSlot } from "../../lib/torneoExpress/courtCheckScope";
import { Button, Modal } from "../ui";
import { assignRoundRobinSchedule } from "../../lib/torneoExpress/assignRoundRobinSchedule";
import { TeScheduleDaysEditor } from "./TeScheduleDaysEditor";

export type TeReprogramarScheduleConfirm = {
  days: TeScheduleDayWindow[];
  durationMinutes: number;
  courtNames: string[];
};

type TeReprogramarProgramacionModalProps = {
  open: boolean;
  saving: boolean;
  bundle: TorneoExpressBundle;
  /** Canchas ocupadas por otras categorías / partidos que no se reescriben. */
  occupiedCourtSlots?: TeOccupiedCourtSlot[];
  onCancel: () => void;
  onConfirm: (schedule: TeReprogramarScheduleConfirm) => void;
};

function flattenPartidos(bundle: TorneoExpressBundle) {
  return Object.values(bundle.partidosPorGrupo).flat();
}

export const TeReprogramarProgramacionModal: React.FC<
  TeReprogramarProgramacionModalProps
> = ({
  open,
  saving,
  bundle,
  occupiedCourtSlots = [],
  onCancel,
  onConfirm,
}) => {
  const allPartidos = useMemo(() => flattenPartidos(bundle), [bundle]);
  const pendingCount = useMemo(
    () => allPartidos.filter((p) => p.estado !== "jugado").length,
    [allPartidos]
  );
  const playedCount = allPartidos.length - pendingCount;

  const [schedule, setSchedule] = useState<TeScheduleDraft>(() =>
    inferScheduleDraftFromPartidos(allPartidos)
  );

  useEffect(() => {
    if (open) {
      setSchedule(inferScheduleDraftFromPartidos(allPartidos));
    }
  }, [open, allPartidos]);

  const scheduleError = useMemo(() => {
    if (
      !Number.isFinite(schedule.durationMinutes) ||
      schedule.durationMinutes <= 0
    ) {
      return "La duración por partido debe ser mayor a 0 minutos.";
    }

    const daysError = validatePlayDays(
      schedule.days,
      schedule.durationMinutes
    );
    if (daysError) return daysError;

    try {
      const persistedMatches = buildScheduleMatchesFromBundle(
        bundle.grupos,
        bundle.partidosPorGrupo
      );
      if (persistedMatches.length === 0) return null;

      const scheduled = assignRoundRobinSchedule({
        matches: persistedMatches,
        courts: courtsForScheduleDay(schedule.days[0]!),
        days: schedule.days,
        durationMinutes: Math.floor(schedule.durationMinutes),
        occupiedCourtSlots,
      });
      validateScheduleInvariants(persistedMatches, scheduled);
      return null;
    } catch (e) {
      if (e instanceof Error && e.message === PARTIDO_CANCHA_OCUPADA_MSG) {
        return PARTIDO_CANCHA_OCUPADA_MSG;
      }
      return e instanceof Error
        ? e.message
        : "No fue posible programar todos los partidos con esta configuración.";
    }
  }, [
    bundle,
    schedule.days,
    schedule.durationMinutes,
    occupiedCourtSlots,
  ]);

  const scheduleReady =
    pendingCount > 0 &&
    Number.isFinite(schedule.durationMinutes) &&
    schedule.durationMinutes > 0 &&
    !scheduleError;

  const handleConfirm = () => {
    if (!scheduleReady) return;
    onConfirm({
      days: schedule.days,
      durationMinutes: Math.floor(schedule.durationMinutes),
      courtNames: courtsForScheduleDay(schedule.days[0]!),
    });
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onCancel();
      }}
      title="Editar programación"
      size="lg"
      footer={
        <div className="riviera-modal__actions te-modal-actions te-reprogramar-modal__actions">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={saving || !scheduleReady}
            loading={saving}
            onClick={handleConfirm}
          >
            {saving ? "Guardando…" : "Aplicar programación"}
          </Button>
        </div>
      }
    >
      <div className="te-reprogramar-modal">
        <p className="te-reprogramar-modal__lead">
          Cada día tiene su fecha, su horario y sus canchas. Los partidos
          pendientes se acomodan con eso; al llenar un día pasan al siguiente.
        </p>
        {playedCount > 0 ? (
          <p className="te-reprogramar-modal__note" role="note">
            {playedCount} partido(s) ya jugado(s) conservan su horario actual.
          </p>
        ) : null}

        <TeScheduleDaysEditor
          days={schedule.days}
          disabled={saving}
          idPrefix="te-reprog-day"
          onChange={(days) => setSchedule((prev) => ({ ...prev, days }))}
        />

        <div className="te-reprogramar-modal__fields">
          <div className="torneo-express-field">
            <label htmlFor="te-reprog-duration">Duración por partido</label>
            <div className="te-reprogramar-modal__duration">
              <input
                id="te-reprog-duration"
                type="number"
                min={1}
                step={1}
                value={schedule.durationMinutes}
                disabled={saving}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  setSchedule((prev) => ({
                    ...prev,
                    durationMinutes: Number.isFinite(parsed)
                      ? parsed
                      : prev.durationMinutes,
                  }));
                }}
              />
              <span className="te-reprogramar-modal__unit">min</span>
            </div>
          </div>
        </div>

        {scheduleError ? (
          <p className="te-reprogramar-modal__error" role="alert">
            {scheduleError}
          </p>
        ) : null}

        {pendingCount === 0 ? (
          <p className="te-reprogramar-modal__error" role="alert">
            No hay partidos pendientes para reprogramar.
          </p>
        ) : null}
      </div>
    </Modal>
  );
};
