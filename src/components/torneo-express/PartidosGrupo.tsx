import React, { useCallback, useEffect, useMemo, useState } from "react";
import { dedupePartidosExpress } from "../../lib/torneoExpress/roundRobin";
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
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";
import { Badge, Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";

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
    puntosLocal: number,
    puntosVisitante: number
  ) => Promise<void>;
  onSaveCancha?: (partidoId: string, cancha: string | null) => Promise<void>;
  onSaveProgramado?: (
    partidoId: string,
    programadoEn: string | null
  ) => Promise<void>;
  onSaveOrden?: (
    updates: Array<{ id: string; orden: number }>
  ) => Promise<void>;
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

function PartidoCanchaField({
  partido,
  canchaEditable,
  savingCancha,
  onSaveCancha,
  forceEdit = false,
  onClose,
}: {
  partido: TorneoExpressPartido;
  canchaEditable: boolean;
  savingCancha: boolean;
  onSaveCancha?: PartidosGrupoProps["onSaveCancha"];
  forceEdit?: boolean;
  onClose?: () => void;
}) {
  const [editingCancha, setEditingCancha] = useState(forceEdit);
  const [draft, setDraft] = useState(() => canchaDraftFromStored(partido.cancha));
  const [canchaError, setCanchaError] = useState<string | null>(null);

  useEffect(() => {
    if (forceEdit) setEditingCancha(true);
  }, [forceEdit]);

  useEffect(() => {
    if (!editingCancha) {
      setDraft(canchaDraftFromStored(partido.cancha));
    }
  }, [partido.id, partido.cancha, editingCancha]);

  const closeEdit = () => {
    setDraft(canchaDraftFromStored(partido.cancha));
    setCanchaError(null);
    setEditingCancha(false);
    onClose?.();
  };

  const guardarCancha = () => {
    if (!onSaveCancha) return;
    const next = normalizeCanchaForSave(draft);
    const prev = normalizeCanchaForSave(canchaDraftFromStored(partido.cancha));
    if (next === prev) {
      closeEdit();
      return;
    }
    setCanchaError(null);
    void onSaveCancha(partido.id, next)
      .then(() => closeEdit())
      .catch(() => {
        setCanchaError("No se pudo guardar la cancha");
        setDraft(canchaDraftFromStored(partido.cancha));
      });
  };

  if (!canchaEditable || !onSaveCancha || !editingCancha) {
    return null;
  }

  return (
    <div className="te-partido-meta-edit__section">
      <p className="te-partido-meta-edit__heading">Cancha</p>
      <label className="te-partido-meta-edit__field te-partido-meta-edit__field--full">
        <span className="sr-only">Número o nombre de cancha</span>
        <input
          id={`cancha-${partido.id}`}
          type="text"
          className="te-partido-meta-edit__input"
          value={draft}
          placeholder="Ej. 1 o Cancha central"
          maxLength={24}
          disabled={savingCancha}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardarCancha();
            if (e.key === "Escape") closeEdit();
          }}
        />
      </label>
      <div className="te-partido-meta-edit__actions">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={savingCancha}
          loading={savingCancha}
          onClick={guardarCancha}
        >
          {savingCancha ? "…" : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={savingCancha}
          onClick={closeEdit}
        >
          Cancelar
        </Button>
      </div>
      {canchaError ? (
        <p className="te-partido-meta-edit__error">{canchaError}</p>
      ) : null}
    </div>
  );
}

function PartidoHorarioField({
  partido,
  horarioEditable,
  savingProgramado,
  onSaveProgramado,
  forceEdit = false,
  onClose,
}: {
  partido: TorneoExpressPartido;
  horarioEditable: boolean;
  savingProgramado: boolean;
  onSaveProgramado?: PartidosGrupoProps["onSaveProgramado"];
  forceEdit?: boolean;
  onClose?: () => void;
}) {
  const [editing, setEditing] = useState(forceEdit);
  const initial = programadoDraftFromPartido(partido);
  const [draftDate, setDraftDate] = useState(initial.date);
  const [draftTime, setDraftTime] = useState(initial.time);
  const [horarioError, setHorarioError] = useState<string | null>(null);

  useEffect(() => {
    if (forceEdit) setEditing(true);
  }, [forceEdit]);

  useEffect(() => {
    if (!editing) {
      const d = programadoDraftFromPartido(partido);
      setDraftDate(d.date);
      setDraftTime(d.time);
    }
  }, [partido, editing]);

  const closeEdit = () => {
    const d = programadoDraftFromPartido(partido);
    setDraftDate(d.date);
    setDraftTime(d.time);
    setHorarioError(null);
    setEditing(false);
    onClose?.();
  };

  const guardarHorario = () => {
    if (!onSaveProgramado) return;
    const next = programadoIsoFromDraft(draftDate, draftTime);
    if (!next) {
      setHorarioError("Revisa la fecha y la hora");
      return;
    }
    const prevMs = new Date(partidoScheduleIso(partido)).getTime();
    const nextMs = new Date(next).getTime();
    if (prevMs === nextMs) {
      closeEdit();
      return;
    }
    setHorarioError(null);
    void onSaveProgramado(partido.id, next)
      .then(() => closeEdit())
      .catch(() => {
        setHorarioError("No se pudo guardar fecha y hora");
        const d = programadoDraftFromPartido(partido);
        setDraftDate(d.date);
        setDraftTime(d.time);
      });
  };

  if (!horarioEditable || !onSaveProgramado || !editing) {
    return null;
  }

  return (
    <div className="te-partido-meta-edit__section">
      <p className="te-partido-meta-edit__heading">Fecha y hora</p>
      <div className="te-partido-meta-edit__row">
        <label className="te-partido-meta-edit__field">
          <span className="te-partido-meta-edit__field-label">Día</span>
          <input
            type="date"
            className="te-partido-meta-edit__input"
            value={draftDate}
            disabled={savingProgramado}
            onChange={(e) => setDraftDate(e.target.value)}
          />
        </label>
        <label className="te-partido-meta-edit__field">
          <span className="te-partido-meta-edit__field-label">Hora</span>
          <input
            type="time"
            className="te-partido-meta-edit__input"
            value={draftTime}
            disabled={savingProgramado}
            onChange={(e) => setDraftTime(e.target.value)}
          />
        </label>
      </div>
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
  localLabel,
  visitLabel,
  editable,
  saving,
  enJuego,
  onSave,
  onSaveCancha,
  onSaveProgramado,
  canchaEditable,
  horarioEditable,
  savingCancha,
  savingProgramado,
  dragHandle,
}: {
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  editable: boolean;
  saving: boolean;
  savingCancha: boolean;
  savingProgramado: boolean;
  enJuego: boolean;
  canchaEditable: boolean;
  horarioEditable: boolean;
  dragHandle?: React.ReactNode;
  onSave?: PartidosGrupoProps["onSaveResultado"];
  onSaveCancha?: PartidosGrupoProps["onSaveCancha"];
  onSaveProgramado?: PartidosGrupoProps["onSaveProgramado"];
}) {
  const played = partido.estado === "jugado";
  const puntosLocal = partido.puntos_local ?? 0;
  const puntosVisitante = partido.puntos_visitante ?? 0;
  const pair1Won = played && puntosLocal > puntosVisitante;
  const pair2Won = played && puntosVisitante > puntosLocal;
  const [editing, setEditing] = useState(false);
  const [canchaEditOpen, setCanchaEditOpen] = useState(false);
  const [horarioEditOpen, setHorarioEditOpen] = useState(false);
  const [pl, setPl] = useState(String(partido.puntos_local ?? ""));
  const [pv, setPv] = useState(String(partido.puntos_visitante ?? ""));
  useEffect(() => {
    setPl(String(partido.puntos_local ?? ""));
    setPv(String(partido.puntos_visitante ?? ""));
    if (partido.estado === "jugado") setEditing(false);
  }, [partido.id, partido.puntos_local, partido.puntos_visitante, partido.estado]);

  const showInputs = editable && onSave && (!played || editing);
  const scheduleIso = partidoScheduleIso(partido);
  const fechaLabel = formatPartidoFecha(scheduleIso);
  const horaLabel = formatPartidoHora(scheduleIso);
  const canchaLabel = formatCanchaDisplay(partido.cancha);
  const metaBusy = savingCancha || savingProgramado;
  return (
    <div className="te-partido-row te-partido-card">
      <div className="te-partido-row__toolbar">
        {dragHandle ?? <span />}
        <PartidoStatusBadge partido={partido} enJuego={enJuego} />
      </div>

      <div className="te-partido-meta-chips">
        {horarioEditable && onSaveProgramado ? (
          <button
            type="button"
            className="te-partido-chip"
            disabled={metaBusy}
            onClick={() => setHorarioEditOpen(true)}
            aria-label={`Editar día (${fechaLabel})`}
          >
            <span className="te-partido-chip__icon" aria-hidden>
              📅
            </span>
            {fechaLabel}
          </button>
        ) : (
          <span className="te-partido-chip">
            <span className="te-partido-chip__icon" aria-hidden>
              📅
            </span>
            {fechaLabel}
          </span>
        )}
        {horarioEditable && onSaveProgramado ? (
          <button
            type="button"
            className="te-partido-chip"
            disabled={metaBusy}
            onClick={() => setHorarioEditOpen(true)}
            aria-label={`Editar hora (${horaLabel})`}
          >
            <span className="te-partido-chip__icon" aria-hidden>
              🕐
            </span>
            {horaLabel}
          </button>
        ) : (
          <span className="te-partido-chip">
            <span className="te-partido-chip__icon" aria-hidden>
              🕐
            </span>
            {horaLabel}
          </span>
        )}
        {canchaEditable && onSaveCancha ? (
          <button
            type="button"
            className="te-partido-chip te-partido-chip--cancha"
            disabled={metaBusy}
            onClick={() => setCanchaEditOpen(true)}
            aria-label={`Editar cancha (${canchaLabel})`}
          >
            <span className="te-partido-chip__icon" aria-hidden>
              📍
            </span>
            {canchaLabel}
          </button>
        ) : (
          <span className="te-partido-chip te-partido-chip--cancha">
            <span className="te-partido-chip__icon" aria-hidden>
              📍
            </span>
            {canchaLabel}
          </span>
        )}
      </div>

      <div className="te-partido-matchup">
        <span
          className={`te-partido-team te-partido-team--local${
            pair1Won
              ? " te-partido-team--winner"
              : pair2Won
                ? " te-partido-team--loser"
                : ""
          }`}
        >
          {localLabel}
        </span>
        {showInputs ? (
          <div className="te-score-inputs">
            <input
              type="number"
              min={0}
              value={pl}
              onChange={(e) => setPl(e.target.value)}
              aria-label={`Puntos ${localLabel}`}
            />
            <input
              type="number"
              min={0}
              value={pv}
              onChange={(e) => setPv(e.target.value)}
              aria-label={`Puntos ${visitLabel}`}
            />
          </div>
        ) : (
          <span
            className={`te-partido-score-center${played ? "" : " is-pending"}`}
            aria-label={
              played
                ? `Marcador ${puntosLocal} a ${puntosVisitante}`
                : "Sin resultado"
            }
          >
            {played ? (
              <>
                <span
                  className={`te-partido-score-num${
                    pair1Won ? " te-partido-score-num--win" : ""
                  }`}
                >
                  {puntosLocal}
                </span>
                <span className="te-partido-score-sep" aria-hidden>
                  –
                </span>
                <span
                  className={`te-partido-score-num${
                    pair2Won ? " te-partido-score-num--win" : ""
                  }`}
                >
                  {puntosVisitante}
                </span>
              </>
            ) : (
              "—"
            )}
          </span>
        )}
        <span
          className={`te-partido-team te-partido-team--visit${
            pair2Won
              ? " te-partido-team--winner"
              : pair1Won
                ? " te-partido-team--loser"
                : ""
          }`}
        >
          {visitLabel}
        </span>
      </div>

      {((horarioEditOpen && horarioEditable && onSaveProgramado) ||
        (canchaEditOpen && canchaEditable && onSaveCancha)) && (
        <div className="te-partido-meta-edit">
          {horarioEditOpen && horarioEditable && onSaveProgramado ? (
            <PartidoHorarioField
              partido={partido}
              horarioEditable={horarioEditable}
              savingProgramado={savingProgramado}
              onSaveProgramado={onSaveProgramado}
              forceEdit
              onClose={() => setHorarioEditOpen(false)}
            />
          ) : null}
          {canchaEditOpen && canchaEditable && onSaveCancha ? (
            <PartidoCanchaField
              partido={partido}
              canchaEditable={canchaEditable}
              savingCancha={savingCancha}
              onSaveCancha={onSaveCancha}
              forceEdit
              onClose={() => setCanchaEditOpen(false)}
            />
          ) : null}
        </div>
      )}

      {showInputs ? (
        <div className="te-partido-actions">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="te-partido-save-btn"
            disabled={saving}
            loading={saving}
            onClick={() =>
              void onSave(partido.id, Number(pl) || 0, Number(pv) || 0).then(
                () => setEditing(false)
              )
            }
          >
            {saving ? "Guardando…" : "Guardar resultado"}
          </Button>
          {played && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="te-partido-edit-btn"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          )}
        </div>
      ) : (
        editable &&
        onSave &&
        played && (
          <div className="te-partido-actions te-partido-actions--score te-partido-actions--corner">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="te-partido-edit-btn"
              onClick={() => setEditing(true)}
            >
              Editar resultado
            </Button>
          </div>
        )
      )}
    </div>
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
  onSaveCancha,
  onSaveProgramado,
  onSaveOrden,
}) => {
  const partidosLimpios = useMemo(
    () => dedupePartidosExpress(partidos),
    [partidos]
  );
  const duplicadosOcultos = partidos.length - partidosLimpios.length;

  const [localPartidos, setLocalPartidos] = useState(partidosLimpios);
  const [ordenError, setOrdenError] = useState<string | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pendingOrderSave, setPendingOrderSave] = useState(false);

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

  const enJuegoId = useMemo(() => {
    const firstPending = localPartidos.find((p) => p.estado === "pendiente");
    return firstPending?.id ?? null;
  }, [localPartidos]);

  const showReorder = allowReorder && editable && Boolean(onSaveOrden);

  const persistOrder = useCallback(
    async (ordered: TorneoExpressPartido[]) => {
      if (!onSaveOrden) return;
      setOrdenError(null);
      setPendingOrderSave(true);
      const updates = ordered.map((p, index) => ({
        id: p.id,
        orden: index + 1,
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
      const next = [...localPartidos];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setLocalPartidos(next);
      await persistOrder(next);
    },
    [localPartidos, persistOrder]
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
          <TablerIcon name="grip-vertical" size={14} aria-hidden={false} /> para
          cambiar el orden de los juegos.
        </p>
      ) : null}

      {duplicadosOcultos > 0 ? (
        <p className="te-partidos-dedupe-hint" role="status">
          Se ocultaron {duplicadosOcultos} partido
          {duplicadosOcultos === 1 ? "" : "s"} duplicado
          {duplicadosOcultos === 1 ? "" : "s"} en este grupo.
        </p>
      ) : null}

      {ordenError ? <p className="te-error">{ordenError}</p> : null}

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
            localLabel={labelById.get(partido.pareja_local_id) ?? "Local"}
            visitLabel={
              labelById.get(partido.pareja_visitante_id) ?? "Visitante"
            }
            editable={editable}
            saving={savingPartidoId === partido.id}
            savingCancha={savingCanchaId === partido.id}
            savingProgramado={savingProgramadoId === partido.id}
            canchaEditable={canchaEditable}
            horarioEditable={horarioEditable}
            enJuego={partido.id === enJuegoId}
            onSave={onSaveResultado}
            onSaveCancha={onSaveCancha}
            onSaveProgramado={onSaveProgramado}
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
                  title="Arrastrar para reordenar"
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
