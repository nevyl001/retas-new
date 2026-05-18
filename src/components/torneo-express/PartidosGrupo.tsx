import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  groupPartidosByRonda,
  sortPartidosByOrden,
} from "../../lib/torneoExpress/roundRobin";
import {
  canchaDraftFromStored,
  formatCanchaDisplay,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";

interface PartidosGrupoProps {
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  editable?: boolean;
  allowReorder?: boolean;
  savingPartidoId?: string | null;
  savingCanchaId?: string | null;
  savingOrden?: boolean;
  canchaEditable?: boolean;
  onSaveResultado?: (
    partidoId: string,
    puntosLocal: number,
    puntosVisitante: number
  ) => Promise<void>;
  onSaveCancha?: (partidoId: string, cancha: string | null) => Promise<void>;
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
    return (
      <span className="te-partido-status te-partido-status--jugado">
        ✓ JUGADO
      </span>
    );
  }
  if (enJuego) {
    return (
      <span className="te-partido-status te-partido-status--live">
        ● EN JUEGO
      </span>
    );
  }
  return (
    <span className="te-partido-status te-partido-status--pendiente">
      PENDIENTE
    </span>
  );
}

function PartidoCanchaField({
  partido,
  canchaEditable,
  savingCancha,
  onSaveCancha,
}: {
  partido: TorneoExpressPartido;
  canchaEditable: boolean;
  savingCancha: boolean;
  onSaveCancha?: PartidosGrupoProps["onSaveCancha"];
}) {
  const [editingCancha, setEditingCancha] = useState(false);
  const [draft, setDraft] = useState(() => canchaDraftFromStored(partido.cancha));
  const [canchaError, setCanchaError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingCancha) {
      setDraft(canchaDraftFromStored(partido.cancha));
    }
  }, [partido.id, partido.cancha, editingCancha]);

  const displayLabel = formatCanchaDisplay(partido.cancha);

  const openEdit = () => {
    setDraft(canchaDraftFromStored(partido.cancha));
    setCanchaError(null);
    setEditingCancha(true);
  };

  const cancelEdit = () => {
    setDraft(canchaDraftFromStored(partido.cancha));
    setCanchaError(null);
    setEditingCancha(false);
  };

  const guardarCancha = () => {
    if (!onSaveCancha) return;
    const next = normalizeCanchaForSave(draft);
    const prev = normalizeCanchaForSave(canchaDraftFromStored(partido.cancha));
    if (next === prev) {
      setEditingCancha(false);
      return;
    }
    setCanchaError(null);
    void onSaveCancha(partido.id, next)
      .then(() => setEditingCancha(false))
      .catch(() => {
        setCanchaError("No se pudo guardar la cancha");
        setDraft(canchaDraftFromStored(partido.cancha));
      });
  };

  if (!canchaEditable || !onSaveCancha) {
    return (
      <div className="te-partido-cancha te-partido-cancha--readonly">
        <span className="te-partido-cancha__pin" aria-hidden>
          ◉
        </span>
        <span className="te-partido-cancha__display">{displayLabel}</span>
      </div>
    );
  }

  if (!editingCancha) {
    return (
      <div className="te-partido-cancha te-partido-cancha--view">
        <span className="te-partido-cancha__pin" aria-hidden>
          ◉
        </span>
        <span className="te-partido-cancha__display">{displayLabel}</span>
        <button
          type="button"
          className="te-partido-cancha__edit"
          onClick={openEdit}
          disabled={savingCancha}
          aria-label={`Editar cancha (${displayLabel})`}
          title="Editar cancha"
        >
          <span className="te-partido-cancha__edit-icon" aria-hidden>
            ✎
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="te-partido-cancha te-partido-cancha--edit">
      <span className="te-partido-cancha__label">Cancha</span>
      <div className="te-partido-cancha__edit-row">
        <span className="te-partido-cancha__prefix">Cancha</span>
        <input
          id={`cancha-${partido.id}`}
          type="text"
          className="te-partido-cancha__input"
          value={draft}
          placeholder="1"
          maxLength={24}
          disabled={savingCancha}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardarCancha();
            if (e.key === "Escape") cancelEdit();
          }}
          aria-label="Número o nombre de cancha"
        />
      </div>
      <div className="te-partido-cancha__actions">
        <button
          type="button"
          className="torneo-express-btn torneo-express-btn--primary te-partido-cancha__save"
          disabled={savingCancha}
          onClick={guardarCancha}
        >
          {savingCancha ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          className="te-partido-cancha__cancel"
          disabled={savingCancha}
          onClick={cancelEdit}
        >
          Cancelar
        </button>
      </div>
      {canchaError && (
        <p className="te-partido-cancha__error">{canchaError}</p>
      )}
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
  canMoveUp,
  canMoveDown,
  onMove,
  onSave,
  onSaveCancha,
  canchaEditable,
  savingCancha,
}: {
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  editable: boolean;
  saving: boolean;
  savingCancha: boolean;
  enJuego: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canchaEditable: boolean;
  onMove?: (direccion: -1 | 1) => void;
  onSave?: PartidosGrupoProps["onSaveResultado"];
  onSaveCancha?: PartidosGrupoProps["onSaveCancha"];
}) {
  const played = partido.estado === "jugado";
  const [editing, setEditing] = useState(false);
  const [pl, setPl] = useState(String(partido.puntos_local ?? ""));
  const [pv, setPv] = useState(String(partido.puntos_visitante ?? ""));
  useEffect(() => {
    setPl(String(partido.puntos_local ?? ""));
    setPv(String(partido.puntos_visitante ?? ""));
    if (partido.estado === "jugado") setEditing(false);
  }, [partido.id, partido.puntos_local, partido.puntos_visitante, partido.estado]);

  const showInputs = editable && onSave && (!played || editing);
  const showCanchaField = true;

  return (
    <div className="te-partido-row">
      {onMove && (
        <div className="te-partido-reorder">
          <button
            type="button"
            className="te-partido-order-btn"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            aria-label="Subir partido"
            title="Subir"
          >
            ↑
          </button>
          <button
            type="button"
            className="te-partido-order-btn"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            aria-label="Bajar partido"
            title="Bajar"
          >
            ↓
          </button>
        </div>
      )}

      <div className="te-partido-matchup">
        <strong>{localLabel}</strong>
        <span className="te-partido-vs">vs</span>
        <strong>{visitLabel}</strong>
      </div>

      <PartidoStatusBadge partido={partido} enJuego={enJuego} />

      {showCanchaField && (
        <PartidoCanchaField
          partido={partido}
          canchaEditable={canchaEditable}
          savingCancha={savingCancha}
          onSaveCancha={onSaveCancha}
        />
      )}

      {showInputs ? (
        <div className="te-partido-actions">
          <div className="te-score-inputs">
            <input
              type="number"
              min={0}
              value={pl}
              onChange={(e) => setPl(e.target.value)}
              aria-label={`Puntos ${localLabel}`}
            />
            <span>-</span>
            <input
              type="number"
              min={0}
              value={pv}
              onChange={(e) => setPv(e.target.value)}
              aria-label={`Puntos ${visitLabel}`}
            />
          </div>
          <button
            type="button"
            className="torneo-express-btn torneo-express-btn--primary te-partido-save-btn"
            disabled={saving}
            onClick={() =>
              void onSave(partido.id, Number(pl) || 0, Number(pv) || 0).then(
                () => setEditing(false)
              )
            }
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      ) : (
        <div className="te-partido-actions te-partido-actions--score">
          <span className="te-partido-score">
            {played
              ? `${partido.puntos_local ?? 0} – ${partido.puntos_visitante ?? 0}`
              : "—"}
          </span>
          {editable && onSave && played && (
            <button
              type="button"
              className="te-partido-edit-btn"
              onClick={() => setEditing(true)}
            >
              Editar
            </button>
          )}
        </div>
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
  savingOrden = false,
  canchaEditable = false,
  onSaveResultado,
  onSaveCancha,
  onSaveOrden,
}) => {
  const sortedFromProps = useMemo(
    () => sortPartidosByOrden(partidos),
    [partidos]
  );

  const [localPartidos, setLocalPartidos] = useState(sortedFromProps);
  const [ordenModificado, setOrdenModificado] = useState(false);
  const [ordenError, setOrdenError] = useState<string | null>(null);

  useEffect(() => {
    if (!ordenModificado) setLocalPartidos(sortedFromProps);
  }, [sortedFromProps, ordenModificado]);

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

  const rondaGroups = useMemo(
    () =>
      groupPartidosByRonda(localPartidos, {
        preserveListOrder: ordenModificado,
      }),
    [localPartidos, ordenModificado]
  );

  const showRondaHeaders = useMemo(
    () =>
      !ordenModificado &&
      localPartidos.some((p) => p.ronda != null && p.ronda > 0),
    [localPartidos, ordenModificado]
  );

  const moverPartido = useCallback((index: number, direccion: -1 | 1) => {
    const destino = index + direccion;
    if (destino < 0 || destino >= localPartidos.length) return;
    const nuevos = [...localPartidos];
    [nuevos[index], nuevos[destino]] = [nuevos[destino], nuevos[index]];
    setLocalPartidos(nuevos);
    setOrdenModificado(true);
  }, [localPartidos]);

  const guardarOrden = useCallback(async () => {
    if (!onSaveOrden) return;
    setOrdenError(null);
    const updates = localPartidos.map((p, index) => ({
      id: p.id,
      orden: index + 1,
    }));
    try {
      await onSaveOrden(updates);
      setOrdenModificado(false);
    } catch (e) {
      setOrdenError(
        e instanceof Error ? e.message : "No se pudo guardar el orden"
      );
    }
  }, [localPartidos, onSaveOrden]);

  if (partidos.length === 0) {
    return <p className="te-subtitle">Sin partidos en este grupo.</p>;
  }

  const showReorder = allowReorder && editable && onSaveOrden;

  const renderPartidoRow = (partido: TorneoExpressPartido, index: number) => (
    <PartidoRow
      key={partido.id}
      partido={partido}
      localLabel={labelById.get(partido.pareja_local_id) ?? "Local"}
      visitLabel={labelById.get(partido.pareja_visitante_id) ?? "Visitante"}
      editable={editable}
      saving={savingPartidoId === partido.id}
      savingCancha={savingCanchaId === partido.id}
      canchaEditable={canchaEditable}
      enJuego={partido.id === enJuegoId}
      canMoveUp={Boolean(showReorder && index > 0)}
      canMoveDown={Boolean(showReorder && index < localPartidos.length - 1)}
      onMove={showReorder ? (d) => moverPartido(index, d) : undefined}
      onSave={onSaveResultado}
      onSaveCancha={onSaveCancha}
    />
  );

  return (
    <div className="te-partidos-list">
      {ordenError && <p className="te-error">{ordenError}</p>}

      {showReorder && ordenModificado && (
        <div className="te-partidos-orden-bar">
          <button
            type="button"
            className="torneo-express-btn torneo-express-btn--primary"
            disabled={savingOrden}
            onClick={() => void guardarOrden()}
          >
            {savingOrden ? "Guardando orden…" : "Guardar nuevo orden"}
          </button>
        </div>
      )}

      {ordenModificado ? (
        localPartidos.map((partido, index) => renderPartidoRow(partido, index))
      ) : (
        rondaGroups.map((group) => (
        <div key={`ronda-${group.ronda}`} className="te-partidos-ronda">
          {showRondaHeaders ? (
            <div className="te-partidos-ronda__head" role="separator">
              <span className="te-partidos-ronda__line" aria-hidden />
              <span className="te-partidos-ronda__label">RONDA {group.ronda}</span>
              <span className="te-partidos-ronda__line" aria-hidden />
            </div>
          ) : null}

          {group.items.map((partido) => {
            const index = localPartidos.findIndex((p) => p.id === partido.id);
            return renderPartidoRow(partido, index);
          })}
        </div>
        ))
      )}
    </div>
  );
};
