import React, { useEffect, useMemo, useState } from "react";
import type { TorneoExpressBundle } from "../../lib/torneoExpress/types";
import { buildDraftScheduleMatches, buildGrupoAssignmentsFromBundle } from "../../lib/torneoExpress/draftScheduleMatch";
import {
  inferScheduleDraftFromPartidos,
  resolveActiveCourtNamesFromDraft,
  type TeScheduleDraft,
} from "../../lib/torneoExpress/inferScheduleDraftFromPartidos";
import { validateScheduleInvariants } from "../../lib/torneoExpress/scheduleInvariants";
import { PARTIDO_CANCHA_OCUPADA_MSG } from "../../lib/torneoExpress/partidoCourtSlotConflict";
import { Button, Modal } from "../ui";
import {
  assignRoundRobinSchedule,
  defaultCourtNames,
  validateCourtNames,
} from "../../lib/torneoExpress/assignRoundRobinSchedule";

type TeReprogramarProgramacionModalProps = {
  open: boolean;
  saving: boolean;
  bundle: TorneoExpressBundle;
  onCancel: () => void;
  onConfirm: (schedule: {
    playDate: string;
    startTime: string;
    durationMinutes: number;
    courtNames: string[];
  }) => void;
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

    if (!schedule.playDate.trim() || !schedule.startTime.trim()) {
      return null;
    }
    if (
      !Number.isFinite(schedule.durationMinutes) ||
      schedule.durationMinutes <= 0
    ) {
      return "La duración por partido debe ser mayor a 0 minutos.";
    }
    if (activeCourtNames.length === 0) {
      return "Agrega al menos una cancha.";
    }

    try {
      const assignments = buildGrupoAssignmentsFromBundle(bundle);
      const draftMatches = buildDraftScheduleMatches(assignments);
      if (draftMatches.length === 0) return null;

      const scheduled = assignRoundRobinSchedule({
        matches: draftMatches,
        courts: activeCourtNames,
        date: schedule.playDate.trim(),
        startTime: schedule.startTime.trim(),
        durationMinutes: Math.floor(schedule.durationMinutes),
      });
      validateScheduleInvariants(draftMatches, scheduled);
      return null;
    } catch (e) {
      if (e instanceof Error && e.message === PARTIDO_CANCHA_OCUPADA_MSG) {
        return PARTIDO_CANCHA_OCUPADA_MSG;
      }
      return "No fue posible programar todos los partidos con esta configuración.";
    }
  }, [
    bundle,
    activeCourtNames,
    schedule.playDate,
    schedule.startTime,
    schedule.durationMinutes,
  ]);

  const scheduleReady =
    pendingCount > 0 &&
    Boolean(schedule.playDate.trim()) &&
    Boolean(schedule.startTime.trim()) &&
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
      playDate: schedule.playDate.trim(),
      startTime: schedule.startTime.trim(),
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
          Ajusta el día, la hora de inicio, la duración y las canchas. Se
          recalculan todos los partidos pendientes de todos los grupos. Con 2
          grupos y 2 canchas, los grupos se intercalan cada N minutos de
          duración (ej. 45 → Grupo 1 a las 9:00 / 10:30, Grupo 2 a las 9:45 /
          11:15).
        </p>
        {playedCount > 0 ? (
          <p className="te-reprogramar-modal__note" role="note">
            {playedCount} partido(s) ya jugado(s) conservan su horario actual.
          </p>
        ) : null}

        <div className="te-reprogramar-modal__fields">
          <div className="torneo-express-field">
            <label htmlFor="te-reprog-date">Día de juego</label>
            <input
              id="te-reprog-date"
              type="date"
              value={schedule.playDate}
              disabled={saving}
              onChange={(e) =>
                setSchedule((prev) => ({ ...prev, playDate: e.target.value }))
              }
            />
          </div>
          <div className="torneo-express-field">
            <label htmlFor="te-reprog-time">Hora de inicio</label>
            <input
              id="te-reprog-time"
              type="time"
              value={schedule.startTime}
              disabled={saving}
              onChange={(e) =>
                setSchedule((prev) => ({ ...prev, startTime: e.target.value }))
              }
            />
          </div>
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
