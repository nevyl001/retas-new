import React, { useEffect, useMemo, useState } from "react";
import type { TorneoExpressEliminatoriaPartido } from "../../lib/torneoExpress/types";
import {
  assignRoundRobinSchedule,
  defaultCourtNames,
  validateCourtNames,
} from "../../lib/torneoExpress/assignRoundRobinSchedule";
import { buildEliminatoriaRoundScheduleMatches } from "../../lib/torneoExpress/eliminatoriaRoundSchedule";
import {
  inferScheduleDraftFromPartidos,
  resolveActiveCourtNamesFromDraft,
  type TeScheduleDraft,
} from "../../lib/torneoExpress/inferScheduleDraftFromPartidos";
import { validateScheduleInvariants } from "../../lib/torneoExpress/scheduleInvariants";
import { PARTIDO_CANCHA_OCUPADA_MSG } from "../../lib/torneoExpress/partidoCourtSlotConflict";
import type { TorneoExpressPartido } from "../../lib/torneoExpress/types";
import { Button, Modal } from "../ui";

type TeReprogramarEliminatoriaModalProps = {
  open: boolean;
  saving: boolean;
  rondaLabel: string;
  partidos: TorneoExpressEliminatoriaPartido[];
  ronda: number;
  onCancel: () => void;
  onConfirm: (schedule: {
    playDate: string;
    startTime: string;
    durationMinutes: number;
    courtNames: string[];
  }) => void;
};

function asInferPartidos(
  partidos: TorneoExpressEliminatoriaPartido[]
): TorneoExpressPartido[] {
  return partidos.map((p) => ({
    id: p.id,
    grupo_id: "",
    pareja_local_id: p.pareja_local_id ?? "",
    pareja_visitante_id: p.pareja_visitante_id ?? "",
    puntos_local: p.puntos_local,
    puntos_visitante: p.puntos_visitante,
    sets_resultado: p.sets_resultado,
    ganador_id: p.ganador_id,
    estado: p.estado,
    cancha: p.cancha,
    programado_en: p.programado_en,
    created_at: p.created_at,
  }));
}

export const TeReprogramarEliminatoriaModal: React.FC<
  TeReprogramarEliminatoriaModalProps
> = ({
  open,
  saving,
  rondaLabel,
  partidos,
  ronda,
  onCancel,
  onConfirm,
}) => {
  const roundPartidos = useMemo(
    () =>
      partidos.filter(
        (p) => p.ronda === ronda && !p.es_bye && p.pareja_local_id && p.pareja_visitante_id
      ),
    [partidos, ronda]
  );
  const pendingCount = useMemo(
    () => roundPartidos.filter((p) => p.estado !== "jugado").length,
    [roundPartidos]
  );
  const playedCount = roundPartidos.length - pendingCount;

  const [schedule, setSchedule] = useState<TeScheduleDraft>(() =>
    inferScheduleDraftFromPartidos(asInferPartidos(roundPartidos))
  );

  useEffect(() => {
    if (open) {
      setSchedule(inferScheduleDraftFromPartidos(asInferPartidos(roundPartidos)));
    }
  }, [open, roundPartidos]);

  const activeCourtNames = useMemo(
    () => resolveActiveCourtNamesFromDraft(schedule),
    [schedule]
  );

  const scheduleError = useMemo(() => {
    const courtError = validateCourtNames(activeCourtNames);
    if (courtError) return courtError;
    if (!schedule.playDate.trim() || !schedule.startTime.trim()) return null;
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
      const draft = buildEliminatoriaRoundScheduleMatches(partidos, ronda);
      if (draft.length === 0) return null;
      const scheduled = assignRoundRobinSchedule({
        matches: draft,
        courts: activeCourtNames,
        date: schedule.playDate.trim(),
        startTime: schedule.startTime.trim(),
        durationMinutes: Math.floor(schedule.durationMinutes),
      });
      validateScheduleInvariants(draft, scheduled);
      return null;
    } catch (e) {
      if (e instanceof Error && e.message === PARTIDO_CANCHA_OCUPADA_MSG) {
        return PARTIDO_CANCHA_OCUPADA_MSG;
      }
      return e instanceof Error
        ? e.message
        : "No fue posible programar los partidos con esta configuración.";
    }
  }, [activeCourtNames, partidos, ronda, schedule]);

  const scheduleReady =
    Boolean(schedule.playDate.trim()) &&
    Boolean(schedule.startTime.trim()) &&
    schedule.durationMinutes > 0 &&
    activeCourtNames.length > 0 &&
    !scheduleError &&
    pendingCount > 0;

  const handleCourtCountChange = (raw: string) => {
    const parsed = Number(raw);
    const courtCount = Number.isFinite(parsed)
      ? Math.max(1, Math.min(8, Math.floor(parsed)))
      : 1;
    setSchedule((prev) => ({
      ...prev,
      courtCount,
      courtNames: defaultCourtNames(courtCount).map(
        (fallback, i) => prev.courtNames[i]?.trim() || fallback
      ),
    }));
  };

  const handleCourtNameChange = (index: number, value: string) => {
    setSchedule((prev) => {
      const courtNames = [...prev.courtNames];
      courtNames[index] = value;
      return { ...prev, courtNames };
    });
  };

  const handleConfirm = () => {
    if (!scheduleReady || saving) return;
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
      title={`Programar ${rondaLabel}`}
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
          Define día, hora de inicio, duración y canchas para{" "}
          <strong>{rondaLabel}</strong>. Se reparte en paralelo cuando hay varias
          canchas (ej. 4 partidos y 2 canchas → dos a las 9:00 y dos a las
          9:45).
        </p>
        {playedCount > 0 ? (
          <p className="te-reprogramar-modal__note" role="note">
            {playedCount} partido(s) ya jugado(s) conservan su horario actual.
          </p>
        ) : null}

        <div className="te-reprogramar-modal__fields">
          <div className="torneo-express-field">
            <label htmlFor="te-elim-reprog-date">Día de juego</label>
            <input
              id="te-elim-reprog-date"
              type="date"
              value={schedule.playDate}
              disabled={saving}
              onChange={(e) =>
                setSchedule((prev) => ({ ...prev, playDate: e.target.value }))
              }
            />
          </div>
          <div className="torneo-express-field">
            <label htmlFor="te-elim-reprog-time">Hora de inicio</label>
            <input
              id="te-elim-reprog-time"
              type="time"
              value={schedule.startTime}
              disabled={saving}
              onChange={(e) =>
                setSchedule((prev) => ({ ...prev, startTime: e.target.value }))
              }
            />
          </div>
          <div className="torneo-express-field">
            <label htmlFor="te-elim-reprog-duration">Duración por partido</label>
            <div className="te-reprogramar-modal__duration">
              <input
                id="te-elim-reprog-duration"
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
            <label htmlFor="te-elim-reprog-courts">Canchas disponibles</label>
            <input
              id="te-elim-reprog-courts"
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
            <div key={`elim-reprog-court-${i}`} className="torneo-express-field">
              <label htmlFor={`te-elim-reprog-court-${i}`}>Cancha {i + 1}</label>
              <input
                id={`te-elim-reprog-court-${i}`}
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
            No hay partidos pendientes para reprogramar en esta ronda.
          </p>
        ) : null}
      </div>
    </Modal>
  );
};
