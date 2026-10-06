import React, { useEffect, useMemo, useState } from "react";
import type { TorneoExpressEliminatoriaPartido } from "../../lib/torneoExpress/types";
import { assignRoundRobinSchedule } from "../../lib/torneoExpress/assignRoundRobinSchedule";
import { buildEliminatoriaRoundScheduleMatches } from "../../lib/torneoExpress/eliminatoriaRoundSchedule";
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
import type { TorneoExpressPartido } from "../../lib/torneoExpress/types";
import { Button, Modal } from "../ui";
import { TeScheduleDaysEditor } from "./TeScheduleDaysEditor";

type TeReprogramarEliminatoriaModalProps = {
  open: boolean;
  saving: boolean;
  rondaLabel: string;
  partidos: TorneoExpressEliminatoriaPartido[];
  ronda: number;
  occupiedCourtSlots?: TeOccupiedCourtSlot[];
  onCancel: () => void;
  onConfirm: (schedule: {
    days: TeScheduleDayWindow[];
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
  occupiedCourtSlots = [],
  onCancel,
  onConfirm,
}) => {
  const roundPartidos = useMemo(
    () =>
      partidos.filter(
        (p) =>
          p.ronda === ronda &&
          !p.es_bye &&
          p.pareja_local_id &&
          p.pareja_visitante_id
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
      const draft = buildEliminatoriaRoundScheduleMatches(partidos, ronda);
      if (draft.length === 0) return null;
      const scheduled = assignRoundRobinSchedule({
        matches: draft,
        courts: courtsForScheduleDay(schedule.days[0]!),
        days: schedule.days,
        durationMinutes: Math.floor(schedule.durationMinutes),
        occupiedCourtSlots,
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
  }, [occupiedCourtSlots, partidos, ronda, schedule]);

  const scheduleReady =
    schedule.durationMinutes > 0 && !scheduleError && pendingCount > 0;

  const handleConfirm = () => {
    if (!scheduleReady || saving) return;
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
          Cada cancha de <strong>{rondaLabel}</strong> tiene su propio
          horario. Al llenar una cancha, los partidos siguen en la siguiente.
        </p>
        {playedCount > 0 ? (
          <p className="te-reprogramar-modal__note" role="note">
            {playedCount} partido(s) ya jugado(s) conservan su horario actual.
          </p>
        ) : null}

        <TeScheduleDaysEditor
          days={schedule.days}
          disabled={saving}
          idPrefix="te-elim-day"
          onChange={(days) => setSchedule((prev) => ({ ...prev, days }))}
        />

        <div className="te-reprogramar-modal__fields">
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
