import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "../ui";
import {
  courtsForScheduleDay,
  courtsListedOnDays,
  validatePlayDays,
} from "../../lib/torneoExpress/scheduleDayWindows";
import { slotsFromParejas } from "../../lib/torneoExpress/groupRoster";
import {
  changesFromAssignments,
  FAIRNESS_COPY,
  groupScheduleApplyNotice,
  INSUFFICIENT_SLOTS_COPY,
  NO_MISSING_COPY,
  pendingWithoutSlot,
  REORGANIZE_NOTE,
  type GroupScheduleChange,
} from "../../lib/torneoExpress/groupSchedulePreview";
import {
  inferScheduleDraftFromPartidos,
  type TeScheduleDraft,
} from "../../lib/torneoExpress/inferScheduleDraftFromPartidos";
import {
  buildCourtTimeOpenings,
  schedulePendingGroup,
  type CourtTimeSlot,
  type ScheduleAssignment,
  type ScheduleMatch,
  type ScheduleMode,
} from "../../lib/torneoExpress/schedulePendingGroup";
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";
import {
  applyGroupSchedule,
  TorneoExpressGrupoOpError,
} from "../../services/torneoExpressGrupoOps";
import { TeScheduleDaysEditor } from "./TeScheduleDaysEditor";

type Step = "config" | "preview" | "blocked" | "notice";

type TeProgramarGrupoModalProps = {
  open: boolean;
  mode: ScheduleMode;
  grupoId: string;
  grupoVersion: number | null;
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  occupied: CourtTimeSlot[];
  onClose: () => void;
  onReload: () => void;
  onApplied: (changed: number) => void;
};

function toScheduleMatch(partido: TorneoExpressPartido): ScheduleMatch {
  return {
    id: partido.id,
    localId: partido.pareja_local_id,
    visitanteId: partido.pareja_visitante_id,
    played: partido.estado === "jugado",
    cancha: partido.cancha ?? null,
    programadoEn: partido.programado_en ?? null,
    ronda: partido.ronda ?? null,
    orden: partido.orden ?? null,
  };
}

function pairLabel(pairId: string, parejas: TorneoExpressGrupoPareja[]): string {
  const row = parejas.find(
    (pareja) =>
      pareja.pareja_id === pairId || (pareja.pareja_previa_ids ?? []).includes(pairId)
  );
  return row?.pareja_display?.trim() || "Pareja";
}

function otherApplyMessage(code: string): string {
  if (code === "COURT_SLOT_CONFLICT") {
    return "Esa cancha ya está ocupada en ese horario. Ajusta la configuración y genera de nuevo la vista previa.";
  }
  if (code === "PAIR_SLOT_CONFLICT") {
    return "Una pareja quedaría en dos partidos a la misma hora. Genera de nuevo la vista previa.";
  }
  if (code === "INCOMPLETE_PROPOSAL" || code === "INVALID_SLOT") {
    return "Hay un horario fuera del rango disponible. Ajusta los días y genera de nuevo la vista previa.";
  }
  if (code === "GROUP_NOT_EDITABLE" || code === "GROUP_NOT_FOUND") {
    return "Este grupo ya no se puede reprogramar.";
  }
  return "No se pudo aplicar la programación.";
}

export const TeProgramarGrupoModal: React.FC<TeProgramarGrupoModalProps> = ({
  open,
  mode,
  grupoId,
  grupoVersion,
  partidos,
  parejas,
  occupied,
  onClose,
  onReload,
  onApplied,
}) => {
  const matches = useMemo(() => partidos.map(toScheduleMatch), [partidos]);
  const missing = useMemo(() => pendingWithoutSlot(matches), [matches]);
  const pendingCount = useMemo(
    () => matches.filter((match) => !match.played).length,
    [matches]
  );
  const [schedule, setSchedule] = useState<TeScheduleDraft>(() =>
    inferScheduleDraftFromPartidos(partidos)
  );
  const [step, setStep] = useState<Step>("config");
  const [changes, setChanges] = useState<GroupScheduleChange[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [previewSlots, setPreviewSlots] = useState<CourtTimeSlot[]>([]);
  const [nowIso, setNowIso] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSchedule(inferScheduleDraftFromPartidos(partidos));
    setStep("config");
    setChanges([]);
    setAssignments([]);
    setPreviewSlots([]);
    setNowIso(null);
    setConfigError(null);
    setNotice(null);
    setSaving(false);
    // Solo al abrir o al cambiar de grupo/modo. Un reload no debe borrar el aviso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, grupoId]);

  const title = mode === "faltantes" ? "Programar faltantes" : "Reorganizar pendientes";
  const nothingToPlace = mode === "faltantes" ? missing.length === 0 : pendingCount === 0;

  const generatePreview = () => {
    if (!Number.isFinite(schedule.durationMinutes) || schedule.durationMinutes <= 0) {
      setConfigError("La duración por partido debe ser mayor a 0 minutos.");
      return;
    }
    const daysError = validatePlayDays(schedule.days, schedule.durationMinutes);
    if (daysError) {
      setConfigError(daysError);
      return;
    }
    if (nothingToPlace) return;

    const generatedAt = new Date().toISOString();
    const openings = buildCourtTimeOpenings({
      days: schedule.days,
      courts: courtsForScheduleDay(schedule.days[0]!),
      durationMinutes: Math.floor(schedule.durationMinutes),
      nowIso: generatedAt,
    });
    const plan = schedulePendingGroup({
      matches,
      slots: slotsFromParejas(parejas),
      openings,
      nowIso: generatedAt,
      mode,
      occupied,
    });
    setConfigError(null);
    setNowIso(generatedAt);
    setPreviewSlots(openings);
    if (!plan.ok) {
      setChanges([]);
      setAssignments([]);
      setStep("blocked");
      return;
    }
    setAssignments(plan.assignments);
    setChanges(
      changesFromAssignments(matches, plan.assignments, (pairId) => pairLabel(pairId, parejas))
    );
    setStep("preview");
  };

  const applyPreview = async () => {
    if (assignments.length === 0 || !nowIso || saving) return;
    if (typeof grupoVersion !== "number" || !Number.isInteger(grupoVersion) || grupoVersion < 1) {
      setNotice(
        "El grupo cambió mientras estabas editando. Actualizamos la información; vuelve a intentar."
      );
      setStep("notice");
      onReload();
      return;
    }
    setSaving(true);
    try {
      const result = await applyGroupSchedule({
        grupoId,
        expectedVersion: grupoVersion,
        mode,
        nowIso,
        courts: courtsListedOnDays(schedule.days),
        slots: previewSlots,
        assignments,
        occupied,
      });
      onApplied(result.changed);
    } catch (error) {
      const code = error instanceof TorneoExpressGrupoOpError ? error.code : "";
      const known = groupScheduleApplyNotice(code);
      if (known) {
        setNotice(known.message);
        setStep("notice");
        if (known.reload) onReload();
        return;
      }
      setConfigError(otherApplyMessage(code));
      if (code === "GROUP_NOT_EDITABLE" || code === "GROUP_NOT_FOUND") onReload();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  let footer: React.ReactNode;
  if (step === "notice") {
    footer = (
      <div className="riviera-modal__actions te-modal-actions">
        <Button type="button" variant="primary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    );
  } else if (step === "blocked") {
    footer = (
      <div className="riviera-modal__actions te-modal-actions">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" onClick={() => setStep("config")}>
          Ajustar horarios
        </Button>
      </div>
    );
  } else if (step === "preview") {
    footer = (
      <div className="riviera-modal__actions te-modal-actions">
        <Button type="button" variant="ghost" disabled={saving} onClick={() => setStep("config")}>
          Volver
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={saving || assignments.length === 0}
          loading={saving}
          onClick={() => {
            void applyPreview();
          }}
        >
          {saving ? "Guardando…" : "Aplicar programación"}
        </Button>
      </div>
    );
  } else {
    footer = (
      <div className="riviera-modal__actions te-modal-actions">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" disabled={nothingToPlace} onClick={generatePreview}>
          Generar preview
        </Button>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={title}
      size="md"
      className="te-programar-grupo-modal"
      footer={footer}
    >
      <div className="te-reprogramar-modal te-programar-grupo">
        {step === "notice" && notice ? (
          <p className="te-reprogramar-modal__note" role="status">
            {notice}
          </p>
        ) : null}

        {step === "blocked" ? (
          <p className="te-reprogramar-modal__error" role="alert">
            {INSUFFICIENT_SLOTS_COPY}
          </p>
        ) : null}

        {step === "config" ? (
          <>
            <p className="te-reprogramar-modal__lead">{FAIRNESS_COPY}</p>
            {mode === "reorganizar" ? (
              <p className="te-reprogramar-modal__note" role="note">
                {REORGANIZE_NOTE}
              </p>
            ) : (
              <p className="te-reprogramar-modal__note" role="status">
                {missing.length === 0
                  ? NO_MISSING_COPY
                  : `${missing.length} partido${missing.length === 1 ? "" : "s"} pendiente${
                      missing.length === 1 ? "" : "s"
                    } por programar`}
              </p>
            )}
            {mode === "reorganizar" && pendingCount === 0 ? (
              <p className="te-reprogramar-modal__note" role="status">
                No hay partidos pendientes para reorganizar.
              </p>
            ) : null}

            <TeScheduleDaysEditor
              days={schedule.days}
              disabled={saving}
              idPrefix={`te-grupo-${mode}`}
              onChange={(days) => setSchedule((prev) => ({ ...prev, days }))}
            />

            <div className="te-reprogramar-modal__fields">
              <div className="torneo-express-field">
                <label htmlFor={`te-grupo-${mode}-duration`}>Duración por partido</label>
                <div className="te-reprogramar-modal__duration">
                  <input
                    id={`te-grupo-${mode}-duration`}
                    type="number"
                    min={1}
                    step={1}
                    value={schedule.durationMinutes}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setSchedule((prev) => ({
                        ...prev,
                        durationMinutes: Number.isFinite(parsed) ? parsed : prev.durationMinutes,
                      }));
                    }}
                  />
                  <span className="te-reprogramar-modal__unit">min</span>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {step === "preview" ? (
          <>
            <p className="te-reprogramar-modal__lead">
              Partidos a modificar: {changes.length}
            </p>
            <p className="te-reprogramar-modal__note" role="note">
              {mode === "reorganizar" ? REORGANIZE_NOTE : FAIRNESS_COPY}
            </p>
            {changes.length === 0 ? (
              <p className="te-reprogramar-modal__note" role="status">
                {mode === "faltantes"
                  ? NO_MISSING_COPY
                  : "Los pendientes ya están en el mejor horario disponible. No hay cambios que aplicar."}
              </p>
            ) : (
              <ul className="te-programacion-preview">
                {changes.map((change) => (
                  <li key={change.matchId} className="te-programacion-change">
                    <div className="te-programacion-change__matchup">
                      <span>{change.localLabel}</span>
                      <span className="te-programacion-change__vs">vs</span>
                      <span>{change.visitLabel}</span>
                    </div>
                    <p className="te-programacion-change__clock">
                      {change.afterTime}
                      <span>{change.afterCourt}</span>
                    </p>
                    <div className="te-programacion-change__shift">
                      <p>
                        <span>Antes</span>
                        {change.before}
                      </p>
                      <p>
                        <span>Después</span>
                        {change.after}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {configError && step !== "notice" ? (
          <p className="te-reprogramar-modal__error" role="alert">
            {configError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
};
