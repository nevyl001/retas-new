import React, { useEffect, useMemo, useState } from "react";
import type { TorneoExpressBundle } from "../../lib/torneoExpress/types";
import { buildScheduleMatchesFromBundle } from "../../lib/torneoExpress/draftScheduleMatch";
import {
  inferScheduleDraftFromPartidos,
  resolveActiveCourtNamesFromDraft,
  type TeScheduleDraft,
} from "../../lib/torneoExpress/inferScheduleDraftFromPartidos";
import { validatePlayDays } from "../../lib/torneoExpress/scheduleDayWindows";
import { validateScheduleInvariants } from "../../lib/torneoExpress/scheduleInvariants";
import { PARTIDO_CANCHA_OCUPADA_MSG } from "../../lib/torneoExpress/partidoCourtSlotConflict";
import { Button, Modal } from "../ui";
import {
  assignRoundRobinSchedule,
  defaultCourtNames,
  validateCourtNames,
} from "../../lib/torneoExpress/assignRoundRobinSchedule";
import { TeScheduleDaysEditor } from "./TeScheduleDaysEditor";

export type TeReprogramarScheduleConfirm = {
  days: Array<{ date: string; startTime: string; endTime: string }>;
  durationMinutes: number;
  courtNames: string[];
};

type TeReprogramarProgramacionModalProps = {
  open: boolean;
  saving: boolean;
  bundle: TorneoExpressBundle;
  onCancel: () => void;
  onConfirm: (schedule: TeReprogramarScheduleConfirm) => void;
};

function flattenPartidos(bundle: TorneoExpressBundle) {
  return Object.values(bundle.partidosPorGrupo).flat();
}

export const TeReprogramarProgramacionModal: React.FC<
  TeReprogramarProgramacionModalProps
> = ({ open, saving, bundle, onCancel, onConfirm }) => {
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

  const activeCourtNames = useMemo(
    () => resolveActiveCourtNamesFromDraft(schedule),
    [schedule]
  );

  const scheduleError = useMemo(() => {
    const courtError = validateCourtNames(activeCourtNames);
    if (courtError) return courtError;

    if (
      !Number.isFinite(schedule.durationMinutes) ||
      schedule.durationMinutes <= 0
    ) {
      return "La duración por partido debe ser mayor a 0 minutos.";
    }
    if (activeCourtNames.length === 0) {
      return "Agrega al menos una cancha.";
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
        courts: activeCourtNames,
        days: schedule.days,
        durationMinutes: Math.floor(schedule.durationMinutes),
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
    activeCourtNames,
    schedule.days,
    schedule.durationMinutes,
  ]);

  const scheduleReady =
    pendingCount > 0 &&
    Number.isFinite(schedule.durationMinutes) &&
    schedule.durationMinutes > 0 &&
    activeCourtNames.length > 0 &&
    !scheduleError;

  const handleCourtCountChange = (raw: string) => {
    const parsed = Number(raw);
    const nextCount = Number.isFinite(parsed)
      ? Math.max(1, Math.min(8, Math.floor(parsed)))
      : 1;
    setSchedule((prev) => {
      const names = [...prev.courtNames];
      while (names.length < nextCount) {
        names.push(
          defaultCourtNames(nextCount)[names.length] ?? `Cancha ${names.length + 1}`
        );
      }
      return {
        ...prev,
        courtCount: nextCount,
        courtNames: names,
      };
    });
  };

  const handleCourtNameChange = (index: number, value: string) => {
    setSchedule((prev) => {
      const names = [...prev.courtNames];
      names[index] = value;
      return { ...prev, courtNames: names };
    });
  };

  const handleConfirm = () => {
    if (!scheduleReady) return;
    onConfirm({
      days: schedule.days,
      durationMinutes: Math.floor(schedule.durationMinutes),
      courtNames: activeCourtNames,
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
      size="md"
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
          Configura cada día con su hora de apertura y cierre. Los partidos
          pendientes se asignan en orden; al llenar un día pasan al siguiente.
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
          <div className="torneo-express-field">
            <label htmlFor="te-reprog-courts">Canchas disponibles</label>
            <input
              id="te-reprog-courts"
              type="number"
              min={1}
              max={8}
              step={1}
              value={schedule.courtCount}
              disabled={saving}
              onChange={(e) => handleCourtCountChange(e.target.value)}
            />
          </div>
        </div>

        <div className="te-reprogramar-modal__courts">
          {Array.from({ length: schedule.courtCount }, (_, i) => (
            <div key={`reprog-court-${i}`} className="torneo-express-field">
              <label htmlFor={`te-reprog-court-${i}`}>Cancha {i + 1}</label>
              <input
                id={`te-reprog-court-${i}`}
                type="text"
                value={schedule.courtNames[i] ?? ""}
                disabled={saving}
                onChange={(e) => handleCourtNameChange(i, e.target.value)}
                placeholder={`Cancha ${i + 1}`}
              />
            </div>
          ))}
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
