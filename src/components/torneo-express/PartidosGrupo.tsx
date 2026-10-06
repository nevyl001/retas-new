import React, { useCallback, useEffect, useMemo, useState } from "react";
import { dedupePartidosExpress } from "../../lib/torneoExpress/roundRobin";
import {
  findPairSameSlotConflictDetails,
  formatPairSameSlotConflictMessage,
  reassignScheduleSlotsOnReorder,
  reorderCreatesCourtConflict,
  REORDER_COURT_SLOT_CONFLICT_MSG,
} from "../../lib/torneoExpress/reorderPartidosSlots";
import {
  canchaDraftFromStored,
  formatCanchaDisplay,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import {
  formatPartidoFecha,
  formatPartidoHora,
  partidoScheduleIso,
  programadoDraftFromPartido,
  programadoIsoFromDraft,
} from "../../lib/torneoExpress/partidoSchedule";
import {
  getPartidoSets,
  matchWinnerSideFromPartido,
} from "../../lib/torneoExpress/partidoSets";
import { findPartidoEnVivoId } from "../../lib/torneoExpress/partidoEnVivo";
import {
  findConflictingPartidoIds,
  findPartidoCourtSlotConflict,
  planScheduleSlotChange,
  PARTIDO_CANCHA_OCUPADA_MSG,
  type ScheduleSlotChangePlan,
} from "../../lib/torneoExpress/partidoCourtSlotConflict";
import { formatCourtOccupiedError } from "../../lib/torneoExpress/courtCheckScope";
import type {
  ExpectedPairs,
  PartidoSetScore,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
  TorneoExpressPartidoFormato,
} from "../../lib/torneoExpress/types";
import { captureExpectedPairs } from "../../lib/torneoExpress/expectedPairs";
import { Badge, Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { PartidoSetsResultModal } from "./PartidoSetsResultModal";

interface PartidosGrupoProps {
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  editable?: boolean;
  allowReorder?: boolean;
  savingPartidoId?: string | null;
  savingCanchaId?: string | null;
  savingProgramadoId?: string | null;
  savingOrden?: boolean;
  canchaEditable?: boolean;
  horarioEditable?: boolean;
  onSaveResultado?: (
    partidoId: string,
    sets: PartidoSetScore[],
    expectedPairs: ExpectedPairs,
    force?: boolean
  ) => Promise<void>;
  onSaveProgramacion?: (
    partidoId: string,
    programadoEn: string,
    cancha: string | null
  ) => Promise<void>;
  onSaveOrden?: (
    updates: Array<{
      id: string;
      orden: number;
      programado_en?: string | null;
      cancha?: string | null;
    }>
  ) => Promise<void>;
  /** Sustituye una plaza “Pareja por definir” por dos jugadores del registro. */
  onDefineVirtualPair?: (parejaId: string, label: string) => void;
  /** Partidos del torneo usados para validar cancha+horario (todos los grupos). */
  partidosCourtCheckScope?: TorneoExpressPartido[];
  /** Formato de marcador heredado del evento. */
  partidoFormato?: TorneoExpressPartidoFormato;
}

function PairName({
  label,
  sideClass,
  stateClass = "",
  virtual,
  onDefine,
}: {
  label: string;
  sideClass: string;
  stateClass?: string;
  virtual: boolean;
  onDefine?: () => void;
}) {
  return (
    <span
      className={`te-partido-team ${sideClass}${stateClass}${
        virtual ? " te-partido-team--virtual" : ""
      }`}
    >
      {label}
      {virtual && onDefine ? (
        <button
          type="button"
          className="te-partido-define-pair"
          onClick={onDefine}
          aria-label={`Sustituir ${label}`}
        >
          Sustituir pareja
        </button>
      ) : null}
    </span>
  );
}

function PartidoStatusBadge({
  partido,
  enJuego,
}: {
  partido: TorneoExpressPartido;
  enJuego: boolean;
}) {
  if (partido.estado === "jugado") {
    return <Badge variant="finished">✓ JUGADO</Badge>;
  }
  if (enJuego) {
    return <Badge variant="live">EN JUEGO</Badge>;
  }
  return <Badge variant="pending">PENDIENTE</Badge>;
}

function PartidoHorarioField({
  partido,
  horarioEditable,
  savingProgramado,
  onSaveProgramacion,
  courtCheckScope,
  forceEdit = false,
  onClose,
}: {
  partido: TorneoExpressPartido;
  horarioEditable: boolean;
  savingProgramado: boolean;
  onSaveProgramacion?: PartidosGrupoProps["onSaveProgramacion"];
  courtCheckScope: TorneoExpressPartido[];
  forceEdit?: boolean;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(forceEdit);
  const initial = programadoDraftFromPartido(partido);
  const [draftDate, setDraftDate] = useState(initial.date);
  const [draftTime, setDraftTime] = useState(initial.time);
  const [draftCancha, setDraftCancha] = useState(() =>
    canchaDraftFromStored(partido.cancha)
  );
  const [horarioError, setHorarioError] = useState<string | null>(null);

  useEffect(() => {
    if (forceEdit) setEditing(true);
  }, [forceEdit]);

  useEffect(() => {
    if (!editing) {
      const d = programadoDraftFromPartido(partido);
      setDraftDate(d.date);
      setDraftTime(d.time);
      setDraftCancha(canchaDraftFromStored(partido.cancha));
    }
  }, [partido, editing]);

  const closeEdit = () => {
    const d = programadoDraftFromPartido(partido);
    setDraftDate(d.date);
    setDraftTime(d.time);
    setDraftCancha(canchaDraftFromStored(partido.cancha));
    setHorarioError(null);
    setEditing(false);
    onClose?.();
  };

  const persistSlot = (programadoEn: string, cancha: string) => {
    if (!onSaveProgramacion) return;
    setHorarioError(null);
    void onSaveProgramacion(partido.id, programadoEn, cancha)
      .then(() => closeEdit())
      .catch((e) => {
        setHorarioError(
          e instanceof Error ? e.message : "No se pudo guardar día, hora y cancha"
        );
      });
  };

  const guardarHorario = () => {
    if (!onSaveProgramacion) return;
    const next = programadoIsoFromDraft(draftDate, draftTime);
    if (!next) {
      setHorarioError("Revisa la fecha y la hora");
      return;
    }
    const cancha = normalizeCanchaForSave(draftCancha);

    let plan: ScheduleSlotChangePlan;
    try {
      plan = planScheduleSlotChange(partido, next, cancha, courtCheckScope);
    } catch (e) {
      const message = e instanceof Error ? e.message : PARTIDO_CANCHA_OCUPADA_MSG;
      if (message !== PARTIDO_CANCHA_OCUPADA_MSG) {
        setHorarioError(message);
        return;
      }
      const hit = findPartidoCourtSlotConflict(
        partido.id,
        next,
        cancha,
        courtCheckScope
      );
      setHorarioError(hit ? formatCourtOccupiedError(hit) : message);
      return;
    }

    if (plan.kind === "noop") {
      closeEdit();
      return;
    }

    persistSlot(plan.programado_en, plan.cancha);
  };

  if (!horarioEditable || !onSaveProgramacion || !editing) {
    return null;
  }

  return (
    <div className="te-partido-meta-edit__section">
      <p className="te-partido-meta-edit__heading">Día, hora y cancha</p>
      <div className="te-partido-meta-edit__row">
        <label className="te-partido-meta-edit__field">
          <span className="te-partido-meta-edit__field-label">Día</span>
          <input
            type="date"
            className="te-partido-meta-edit__input"
            value={draftDate}
            disabled={savingProgramado}
            onChange={(e) => {
              setDraftDate(e.target.value);
              setHorarioError(null);
            }}
          />
        </label>
        <label className="te-partido-meta-edit__field">
          <span className="te-partido-meta-edit__field-label">Hora</span>
          <input
            type="time"
            className="te-partido-meta-edit__input"
            value={draftTime}
            disabled={savingProgramado}
            onChange={(e) => {
              setDraftTime(e.target.value);
              setHorarioError(null);
            }}
          />
        </label>
      </div>
      <label className="te-partido-meta-edit__field te-partido-meta-edit__field--full">
        <span className="te-partido-meta-edit__field-label">Cancha</span>
        <input
          type="text"
          className="te-partido-meta-edit__input"
          value={draftCancha}
          placeholder="Ej. 1 o Cancha central"
          maxLength={24}
          disabled={savingProgramado}
          onChange={(e) => {
            setDraftCancha(e.target.value);
            setHorarioError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardarHorario();
            if (e.key === "Escape") closeEdit();
          }}
        />
      </label>
      <div className="te-partido-meta-edit__actions">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={savingProgramado}
          loading={savingProgramado}
          onClick={guardarHorario}
        >
          {savingProgramado ? "…" : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={savingProgramado}
          onClick={closeEdit}
        >
          Cancelar
        </Button>
      </div>
      {horarioError ? (
        <p className="te-partido-meta-edit__error">{horarioError}</p>
      ) : null}
    </div>
  );
}

function PartidoRow({
  partido,
  parejas,
  localLabel,
  visitLabel,
  matchNumber,
  editable,
  saving,
  enJuego,
  onSave,
  onSaveProgramacion,
  courtCheckScope,
  canchaEditable,
  horarioEditable,
  savingCancha,
  savingProgramado,
  dragHandle,
  courtConflict = false,
  pairSlotConflict = false,
  partidoFormato = "flexible",
  onDefineVirtualPair,
}: {
  partido: TorneoExpressPartido;
  parejas: TorneoExpressGrupoPareja[];
  localLabel: string;
  visitLabel: string;
  /** Solo presentación (Partido 01…). */
  matchNumber: number;
  editable: boolean;
  saving: boolean;
  savingCancha: boolean;
  savingProgramado: boolean;
  enJuego: boolean;
  canchaEditable: boolean;
  horarioEditable: boolean;
  courtCheckScope: TorneoExpressPartido[];
  courtConflict?: boolean;
  /** Pareja ya tiene otro partido en el mismo horario (tras reordenar). */
  pairSlotConflict?: boolean;
  dragHandle?: React.ReactNode;
  onSave?: PartidosGrupoProps["onSaveResultado"];
  onSaveProgramacion?: PartidosGrupoProps["onSaveProgramacion"];
  partidoFormato?: PartidosGrupoProps["partidoFormato"];
  onDefineVirtualPair?: PartidosGrupoProps["onDefineVirtualPair"];
}) {
  const scheduleConflict = courtConflict || pairSlotConflict;
  const played = partido.estado === "jugado";
  const [setsModalOpen, setSetsModalOpen] = useState(false);
  const [openedExpected, setOpenedExpected] = useState<ExpectedPairs | null>(
    null
  );
  const [scheduleEditOpen, setScheduleEditOpen] = useState(false);

  const winnerSide = played ? matchWinnerSideFromPartido(partido) : null;
  const pair1Won = winnerSide === "local";
  const pair2Won = winnerSide === "visitante";
  const sets = played ? getPartidoSets(partido) : [];
  const hasSuperMuerte = sets.some((set) => set.super_muerte === true);
  const setsAria =
    sets.length === 0
      ? undefined
      : sets
          .map((set, index) => {
            const name = set.super_muerte ? "Súper muerte" : `Set ${index + 1}`;
            return `${name}: ${set.local} a ${set.visitante}`;
          })
          .join(". ");

  const unscheduled = !partido.programado_en?.trim();
  const scheduleIso = partidoScheduleIso(partido);
  const fechaLabel = unscheduled ? "Por programar" : formatPartidoFecha(scheduleIso);
  const horaLabel = unscheduled ? "Por programar" : formatPartidoHora(scheduleIso);
  const canchaLabel = unscheduled
    ? "Por programar"
    : formatCanchaDisplay(partido.cancha);
  const metaBusy = savingCancha || savingProgramado;
  const canEditSchedule =
    canchaEditable && horarioEditable && !!onSaveProgramacion;
  const canEditResult = editable && !!onSave;
  const matchLabel = `Partido ${String(matchNumber).padStart(2, "0")}`;
  const localPareja = parejas.find(
    (pareja) => pareja.pareja_id === partido.pareja_local_id
  );
  const visitPareja = parejas.find(
    (pareja) => pareja.pareja_id === partido.pareja_visitante_id
  );
  const defineLocal =
    localPareja?.is_virtual && onDefineVirtualPair
      ? () => onDefineVirtualPair(localPareja.pareja_id, localLabel)
      : undefined;
  const defineVisit =
    visitPareja?.is_virtual && onDefineVirtualPair
      ? () => onDefineVirtualPair(visitPareja.pareja_id, visitLabel)
      : undefined;

  const openResultado = () => {
    const captured = captureExpectedPairs(partido, parejas);
    if (!captured) return;
    setOpenedExpected(captured);
    setSetsModalOpen(true);
  };

  const closeResultado = () => {
    setSetsModalOpen(false);
    setOpenedExpected(null);
  };

  return (
    <>
      <div
        className={`te-partido-row te-partido-card${
          scheduleConflict ? " te-partido-card--court-conflict" : ""
        }`}
      >
        <div className="te-partido-row__toolbar">
          <div className="te-partido-row__toolbar-start">
            {dragHandle ?? null}
            <span className="te-partido-card__index">{matchLabel}</span>
          </div>
          <PartidoStatusBadge partido={partido} enJuego={enJuego} />
        </div>

        <div className="te-partido-meta-chips">
          {courtConflict ? (
            <span
              className="te-partido-chip te-partido-chip--conflict"
              role="status"
            >
              Cancha ocupada
            </span>
          ) : null}
          {pairSlotConflict ? (
            <span
              className="te-partido-chip te-partido-chip--conflict"
              role="status"
            >
              Pareja a esa hora
            </span>
          ) : null}
          {canEditSchedule ? (
            <button
              type="button"
              className="te-partido-chip"
              disabled={metaBusy}
              onClick={() => setScheduleEditOpen(true)}
              aria-label={`Editar día (${fechaLabel})`}
            >
              {fechaLabel}
            </button>
          ) : (
            <span className="te-partido-chip">{fechaLabel}</span>
          )}
          {canEditSchedule ? (
            <button
              type="button"
              className="te-partido-chip"
              disabled={metaBusy}
              onClick={() => setScheduleEditOpen(true)}
              aria-label={`Editar hora (${horaLabel})`}
            >
              {horaLabel}
            </button>
          ) : (
            <span className="te-partido-chip">{horaLabel}</span>
          )}
          {canEditSchedule ? (
            <button
              type="button"
              className="te-partido-chip te-partido-chip--cancha"
              disabled={metaBusy}
              onClick={() => setScheduleEditOpen(true)}
              aria-label={`Editar cancha (${canchaLabel})`}
            >
              {canchaLabel}
            </button>
          ) : (
            <span className="te-partido-chip te-partido-chip--cancha">
              {canchaLabel}
            </span>
          )}
        </div>

        {played ? (
          <div
            className={`te-partido-scoreboard te-partido-scoreboard--played${
              hasSuperMuerte ? " te-partido-scoreboard--sm" : ""
            }`}
          >
            <div className="te-partido-scoreboard__sides">
              <PairName
                label={localLabel}
                sideClass="te-partido-team--local"
                stateClass={
                  pair1Won
                    ? " te-partido-team--winner"
                    : pair2Won
                      ? " te-partido-team--loser"
                      : ""
                }
                virtual={localPareja?.is_virtual === true}
                onDefine={defineLocal}
              />
              <PairName
                label={visitLabel}
                sideClass="te-partido-team--visit"
                stateClass={
                  pair2Won
                    ? " te-partido-team--winner"
                    : pair1Won
                      ? " te-partido-team--loser"
                      : ""
                }
                virtual={visitPareja?.is_virtual === true}
                onDefine={defineVisit}
              />
            </div>
            {sets.length > 0 ? (
              <div className="te-partido-setboard" aria-label={setsAria}>
                {sets.map((set, index) => {
                  const localWonSet = set.local > set.visitante;
                  const visitWonSet = set.visitante > set.local;
                  return (
                    <div
                      key={index}
                      className={`te-partido-setcol${
                        set.super_muerte ? " te-partido-setcol--sm" : ""
                      }`}
                    >
                      {set.super_muerte ? (
                        <span className="te-partido-setcol__mark">SM</span>
                      ) : null}
                      <span
                        className={`te-partido-setcol__n${
                          localWonSet
                            ? " te-partido-setcol__n--win"
                            : " te-partido-setcol__n--lose"
                        }`}
                      >
                        {set.local}
                      </span>
                      <span
                        className={`te-partido-setcol__n${
                          visitWonSet
                            ? " te-partido-setcol__n--win"
                            : " te-partido-setcol__n--lose"
                        }`}
                      >
                        {set.visitante}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="te-partido-scoreboard">
            <div className="te-partido-scoreboard__row">
              <PairName
                label={localLabel}
                sideClass="te-partido-team--local"
                virtual={localPareja?.is_virtual === true}
                onDefine={defineLocal}
              />
            </div>
            <span className="te-partido-vs" aria-hidden>
              vs
            </span>
            <div className="te-partido-scoreboard__row">
              <PairName
                label={visitLabel}
                sideClass="te-partido-team--visit"
                virtual={visitPareja?.is_virtual === true}
                onDefine={defineVisit}
              />
            </div>
          </div>
        )}

        {scheduleEditOpen && canEditSchedule ? (
          <div className="te-partido-meta-edit">
            <PartidoHorarioField
              partido={partido}
              horarioEditable={horarioEditable}
              savingProgramado={metaBusy}
              onSaveProgramacion={onSaveProgramacion}
              courtCheckScope={courtCheckScope}
              forceEdit
              onClose={() => setScheduleEditOpen(false)}
            />
          </div>
        ) : null}

        {canEditResult && played ? (
          <div className="te-partido-actions te-partido-actions--score te-partido-actions--corner">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="te-partido-edit-btn"
              onClick={openResultado}
            >
              Corregir resultado
            </Button>
          </div>
        ) : null}

        {canEditResult && !played ? (
          <div className="te-partido-actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={saving}
              onClick={openResultado}
            >
              Capturar resultado
            </Button>
          </div>
        ) : null}
      </div>

      {canEditResult ? (
        <PartidoSetsResultModal
          open={setsModalOpen}
          onClose={closeResultado}
          localLabel={localLabel}
          visitLabel={visitLabel}
          initialPartido={partido}
          expectedPairs={openedExpected}
          partidoFormato={partidoFormato}
          saving={saving}
          onSave={(sets, expected) => {
            if (!expected) return Promise.resolve();
            return onSave!(partido.id, sets, expected, played);
          }}
        />
      ) : null}
    </>
  );
}

export const PartidosGrupo: React.FC<PartidosGrupoProps> = ({
  partidos,
  parejas,
  editable = false,
  allowReorder = false,
  savingPartidoId,
  savingCanchaId,
  savingProgramadoId,
  savingOrden = false,
  canchaEditable = false,
  horarioEditable = false,
  onSaveResultado,
  onSaveProgramacion,
  onSaveOrden,
  onDefineVirtualPair,
  partidosCourtCheckScope,
  partidoFormato = "flexible",
}) => {
  const partidosLimpios = useMemo(
    () => dedupePartidosExpress(partidos),
    [partidos]
  );
  const courtCheckScope = useMemo(
    () =>
      dedupePartidosExpress(
        partidosCourtCheckScope && partidosCourtCheckScope.length > 0
          ? partidosCourtCheckScope
          : partidos
      ),
    [partidos, partidosCourtCheckScope]
  );

  const duplicadosOcultos = partidos.length - partidosLimpios.length;

  const [localPartidos, setLocalPartidos] = useState(partidosLimpios);
  const [ordenError, setOrdenError] = useState<string | null>(null);
  const [pairConflictPartidoIds, setPairConflictPartidoIds] = useState<
    Set<string>
  >(() => new Set());
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pendingOrderSave, setPendingOrderSave] = useState(false);

  const conflictingPartidoIds = useMemo(() => {
    const localIds = new Set(localPartidos.map((p) => p.id));
    const merged = [
      ...courtCheckScope.filter((p) => !localIds.has(p.id)),
      ...localPartidos,
    ];
    return findConflictingPartidoIds(merged);
  }, [courtCheckScope, localPartidos]);

  const mergedCourtCheckScope = useMemo(() => {
    const localIds = new Set(localPartidos.map((p) => p.id));
    return [
      ...courtCheckScope.filter((p) => !localIds.has(p.id)),
      ...localPartidos,
    ];
  }, [courtCheckScope, localPartidos]);

  const conflictMatchLabels = useMemo(() => {
    return localPartidos
      .map((partido, index) =>
        conflictingPartidoIds.has(partido.id)
          ? `Partido ${String(index + 1).padStart(2, "0")}`
          : null
      )
      .filter((label): label is string => Boolean(label));
  }, [localPartidos, conflictingPartidoIds]);

  useEffect(() => {
    if (!pendingOrderSave && !savingOrden) {
      setLocalPartidos(partidosLimpios);
    }
  }, [partidosLimpios, pendingOrderSave, savingOrden]);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    parejas.forEach((p) =>
      m.set(p.pareja_id, p.pareja_display ?? p.pareja_id)
    );
    return m;
  }, [parejas]);

  const enJuegoId = useMemo(
    () => findPartidoEnVivoId(localPartidos),
    [localPartidos]
  );

  const showReorder = allowReorder && editable && Boolean(onSaveOrden);

  const persistOrder = useCallback(
    async (ordered: TorneoExpressPartido[]) => {
      if (!onSaveOrden) return;
      setOrdenError(null);
      setPairConflictPartidoIds(new Set());
      setPendingOrderSave(true);
      const updates = ordered.map((p, index) => ({
        id: p.id,
        orden: index + 1,
        programado_en: p.programado_en ?? null,
        cancha: p.cancha ?? null,
      }));
      try {
        await onSaveOrden(updates);
      } catch (e) {
        setLocalPartidos(partidosLimpios);
        setOrdenError(
          e instanceof Error ? e.message : "No se pudo guardar el orden"
        );
      } finally {
        setPendingOrderSave(false);
      }
    },
    [onSaveOrden, partidosLimpios]
  );

  const reorderPartidos = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const externalPartidos = courtCheckScope.filter(
        (p) => !localPartidos.some((local) => local.id === p.id)
      );
      const next = reassignScheduleSlotsOnReorder(
        localPartidos,
        fromIndex,
        toIndex,
        { externalPartidos }
      );
      const conflict = findPairSameSlotConflictDetails(next);
      if (conflict.pairIds.length > 0) {
        setPairConflictPartidoIds(new Set(conflict.partidoIds));
        setOrdenError(
          formatPairSameSlotConflictMessage(conflict.pairIds, labelById)
        );
        return;
      }
      if (reorderCreatesCourtConflict(next, externalPartidos)) {
        setOrdenError(REORDER_COURT_SLOT_CONFLICT_MSG);
        return;
      }
      setPairConflictPartidoIds(new Set());
      setLocalPartidos(next);
      await persistOrder(next);
    },
    [courtCheckScope, labelById, localPartidos, persistOrder]
  );

  const clearDragState = useCallback(() => {
    setDragFromIndex(null);
    setDragOverIndex(null);
  }, []);

  const onDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      if (!showReorder || savingOrden) {
        e.preventDefault();
        return;
      }
      setOrdenError(null);
      setPairConflictPartidoIds(new Set());
      setDragFromIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    [showReorder, savingOrden]
  );

  const onDrop = useCallback(
    (targetIndex: number) => async (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain");
      const fromIndex =
        dragFromIndex ?? (raw !== "" ? Number.parseInt(raw, 10) : NaN);
      clearDragState();
      if (Number.isNaN(fromIndex) || fromIndex === targetIndex) return;
      await reorderPartidos(fromIndex, targetIndex);
    },
    [clearDragState, dragFromIndex, reorderPartidos]
  );

  if (partidosLimpios.length === 0) {
    return <p className="te-subtitle">Sin partidos en este grupo.</p>;
  }

  return (
    <div className="te-partidos-list">
      {showReorder ? (
        <p className="te-partidos-order-hint">
          Arrastra el icono{" "}
          <TablerIcon name="grip-vertical" size={14} aria-hidden={false} />{" "}
          para cambiar el orden; los horarios se reorganizan solos.
        </p>
      ) : null}

      {duplicadosOcultos > 0 ? (
        <p className="te-partidos-dedupe-hint" role="status">
          Se ocultaron {duplicadosOcultos} partido
          {duplicadosOcultos === 1 ? "" : "s"} duplicado
          {duplicadosOcultos === 1 ? "" : "s"} en este grupo.
        </p>
      ) : null}

      {ordenError ? (
        <div className="te-partidos-court-conflict-banner" role="alert">
          <span className="te-partidos-court-conflict-banner__label">
            Conflicto de parejas
          </span>
          <p className="te-partidos-court-conflict-banner__text">{ordenError}</p>
        </div>
      ) : null}

      {conflictMatchLabels.length > 0 ? (
        <div className="te-partidos-court-conflict-banner" role="alert">
          <span className="te-partidos-court-conflict-banner__label">
            Conflicto de programación
          </span>
          <p className="te-partidos-court-conflict-banner__text">
            {`Corrige ${conflictMatchLabels.join(" y ")}: misma cancha y horario.`}
          </p>
        </div>
      ) : null}

      {localPartidos.map((partido, index) => (
        <div
          key={partido.id}
          className={`te-partido-row-wrap${
            dragOverIndex === index ? " te-partido-row-wrap--over" : ""
          }${dragFromIndex === index ? " te-partido-row-wrap--dragging" : ""}`}
          onDragOver={(e) => {
            if (!showReorder || savingOrden) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverIndex(index);
          }}
          onDragLeave={() => {
            if (dragOverIndex === index) setDragOverIndex(null);
          }}
          onDrop={(e) => void onDrop(index)(e)}
        >
          <PartidoRow
            partido={partido}
            parejas={parejas}
            localLabel={labelById.get(partido.pareja_local_id) ?? "Local"}
            visitLabel={
              labelById.get(partido.pareja_visitante_id) ?? "Visitante"
            }
            matchNumber={index + 1}
            editable={editable}
            saving={savingPartidoId === partido.id}
            savingCancha={savingCanchaId === partido.id}
            savingProgramado={savingProgramadoId === partido.id}
            canchaEditable={canchaEditable}
            horarioEditable={horarioEditable}
            enJuego={partido.id === enJuegoId}
            onSave={onSaveResultado}
            onSaveProgramacion={onSaveProgramacion}
            partidoFormato={partidoFormato}
            courtCheckScope={mergedCourtCheckScope}
            courtConflict={conflictingPartidoIds.has(partido.id)}
            pairSlotConflict={pairConflictPartidoIds.has(partido.id)}
            onDefineVirtualPair={onDefineVirtualPair}
            dragHandle={
              showReorder ? (
                <button
                  type="button"
                  className="te-partido-drag-handle"
                  draggable={!savingOrden}
                  disabled={savingOrden}
                  onDragStart={onDragStart(index)}
                  onDragEnd={clearDragState}
                  aria-label={`Arrastrar partido ${index + 1}`}
                  title="Arrastrar para reordenar horarios"
                >
                  <TablerIcon name="grip-vertical" size={18} />
                </button>
              ) : undefined
            }
          />
        </div>
      ))}
    </div>
  );
};
