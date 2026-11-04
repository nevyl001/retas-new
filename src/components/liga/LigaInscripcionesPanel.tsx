import React, { useEffect, useMemo, useState } from "react";
import type { LigaJugadorPoolItem } from "../../lib/liga/types";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import { Button, Modal } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import {
  TeActionMenu,
  type TeActionMenuItem,
} from "../torneo-express/TeActionMenu";
import {
  filterLigaInscripcionesPool,
  LIGA_INSCRIPCIONES_PAGE_SIZE,
  paginateLigaInscripciones,
} from "./ligaInscripcionesUtils";
import "../torneo-express/te-action-menu.css";

export interface LigaInscripcionesPanelProps {
  jugadoresPool: LigaJugadorPoolItem[];
  inscritosIds: ReadonlySet<string>;
  ligaEditable: boolean;
  busy: boolean;
  /** Solo liga individual rotativa: permite abrir flujo de sustitución. */
  canSustituir?: boolean;
  /** jugador_id → etiqueta corta (ej. Sustituto J6). */
  sustitutoLabelsById?: ReadonlyMap<string, string>;
  onToggleInscripcion: (jugadorId: string, inscrito: boolean) => void | Promise<void>;
  onSustituirJugador?: (jugadorId: string) => void;
  onGoToRegistro: () => void;
}

export const LigaInscripcionesPanel: React.FC<LigaInscripcionesPanelProps> = ({
  jugadoresPool,
  inscritosIds,
  ligaEditable,
  busy,
  canSustituir = false,
  sustitutoLabelsById,
  onToggleInscripcion,
  onSustituirJugador,
  onGoToRegistro,
}) => {
  const [inscritosQuery, setInscritosQuery] = useState("");
  const [inscritosPage, setInscritosPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addPage, setAddPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const totalInscritos = inscritosIds.size;
  const totalDisponibles = Math.max(0, jugadoresPool.length - totalInscritos);
  const totalRegistro = jugadoresPool.length;

  const inscritosFiltered = useMemo(
    () =>
      filterLigaInscripcionesPool({
        jugadores: jugadoresPool,
        inscritosIds,
        query: inscritosQuery,
        filter: "inscritos",
      }),
    [jugadoresPool, inscritosIds, inscritosQuery]
  );

  const disponiblesFiltered = useMemo(
    () =>
      filterLigaInscripcionesPool({
        jugadores: jugadoresPool,
        inscritosIds,
        query: addQuery,
        filter: "sin_inscribir",
      }),
    [jugadoresPool, inscritosIds, addQuery]
  );

  const {
    pageItems: inscritosPageItems,
    page: inscritosSafePage,
    totalPages: inscritosTotalPages,
  } = useMemo(
    () =>
      paginateLigaInscripciones(
        inscritosFiltered,
        inscritosPage,
        LIGA_INSCRIPCIONES_PAGE_SIZE
      ),
    [inscritosFiltered, inscritosPage]
  );

  const {
    pageItems: addPageItems,
    page: addSafePage,
    totalPages: addTotalPages,
  } = useMemo(
    () =>
      paginateLigaInscripciones(
        disponiblesFiltered,
        addPage,
        LIGA_INSCRIPCIONES_PAGE_SIZE
      ),
    [disponiblesFiltered, addPage]
  );

  useEffect(() => {
    if (inscritosSafePage !== inscritosPage) setInscritosPage(inscritosSafePage);
  }, [inscritosSafePage, inscritosPage]);

  useEffect(() => {
    if (addSafePage !== addPage) setAddPage(addSafePage);
  }, [addSafePage, addPage]);

  useEffect(() => {
    setInscritosPage(1);
  }, [inscritosQuery]);

  useEffect(() => {
    setAddPage(1);
  }, [addQuery]);

  useEffect(() => {
    if (!addOpen) {
      setAddQuery("");
      setAddPage(1);
    }
  }, [addOpen]);

  const handleToggle = async (jugadorId: string, inscrito: boolean) => {
    if (busy || pendingId) return;
    setPendingId(jugadorId);
    try {
      await onToggleInscripcion(jugadorId, inscrito);
    } finally {
      setPendingId(null);
    }
  };

  const inscritosRangeStart =
    inscritosFiltered.length === 0
      ? 0
      : (inscritosSafePage - 1) * LIGA_INSCRIPCIONES_PAGE_SIZE + 1;
  const inscritosRangeEnd = Math.min(
    inscritosSafePage * LIGA_INSCRIPCIONES_PAGE_SIZE,
    inscritosFiltered.length
  );

  const addRangeStart =
    disponiblesFiltered.length === 0
      ? 0
      : (addSafePage - 1) * LIGA_INSCRIPCIONES_PAGE_SIZE + 1;
  const addRangeEnd = Math.min(
    addSafePage * LIGA_INSCRIPCIONES_PAGE_SIZE,
    disponiblesFiltered.length
  );

  const cardMenuItems = (j: LigaJugadorPoolItem): TeActionMenuItem[] => {
    const items: TeActionMenuItem[] = [];
    if (canSustituir && onSustituirJugador) {
      items.push({
        id: "sustituir",
        label: "Sustituir jugador",
        disabled: busy || pendingId != null,
        onSelect: () => onSustituirJugador(j.id),
      });
    }
    items.push({
      id: "quitar",
      label: pendingId === j.id ? "Quitando…" : "Quitar de la liga",
      danger: true,
      disabled: busy || pendingId != null,
      separatorBefore: items.length > 0,
      onSelect: () => {
        void handleToggle(j.id, true);
      },
    });
    return items;
  };

  return (
    <div className="liga-card rv-card liga-inscripciones liga-inscripciones--roster">
      <header className="liga-inscripciones__header liga-inscripciones__header--roster">
        <div className="liga-inscripciones__header-copy">
          <h2 className="liga-inscripciones__title">Jugadores inscritos</h2>
          <p className="liga-inscripciones__subtitle">
            Participantes activos de esta liga.
          </p>
        </div>
        {ligaEditable ? (
          <Button
            type="button"
            variant="primary"
            className="liga-inscripciones__add-btn"
            disabled={busy}
            onClick={() => setAddOpen(true)}
          >
            <TablerIcon name="plus" size={18} />
            Agregar jugador
          </Button>
        ) : null}
      </header>

      <div
        className="liga-inscripciones__stats liga-inscripciones__stats--compact"
        aria-label="Resumen de inscripciones"
      >
        <div className="liga-inscripciones__stat">
          <span className="liga-inscripciones__stat-label">Inscritos</span>
          <strong className="liga-inscripciones__stat-value">{totalInscritos}</strong>
        </div>
        <div className="liga-inscripciones__stat">
          <span className="liga-inscripciones__stat-label">Disponibles</span>
          <strong className="liga-inscripciones__stat-value">{totalDisponibles}</strong>
        </div>
        <div className="liga-inscripciones__stat">
          <span className="liga-inscripciones__stat-label">Total elegibles</span>
          <strong className="liga-inscripciones__stat-value">{totalRegistro}</strong>
        </div>
      </div>

      {totalInscritos > 8 ? (
        <div className="liga-inscripciones__search liga-inscripciones__search--roster">
          <TablerIcon
            name="search"
            size={18}
            className="liga-inscripciones__search-icon"
          />
          <input
            type="search"
            value={inscritosQuery}
            onChange={(e) => setInscritosQuery(e.target.value)}
            placeholder="Buscar inscrito…"
            aria-label="Buscar jugador inscrito"
            autoComplete="off"
          />
          {inscritosQuery ? (
            <button
              type="button"
              className="liga-inscripciones__search-clear"
              onClick={() => setInscritosQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <TablerIcon name="x" size={16} />
            </button>
          ) : null}
        </div>
      ) : null}

      {jugadoresPool.length === 0 ? (
        <div className="liga-empty liga-inscripciones__empty">
          <p>Aún no hay jugadores en el registro.</p>
          <Button type="button" variant="secondary" size="sm" onClick={onGoToRegistro}>
            Ir al registro de jugadores
          </Button>
        </div>
      ) : inscritosFiltered.length === 0 ? (
        <div className="liga-empty liga-inscripciones__empty">
          <p>
            {inscritosQuery.trim()
              ? "Ningún inscrito coincide con la búsqueda."
              : "Todavía no hay jugadores inscritos en esta liga."}
          </p>
          {ligaEditable && !inscritosQuery.trim() ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              Agregar jugador
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="liga-inscripciones__grid liga-inscripciones__grid--roster">
            {inscritosPageItems.map((j) => {
              const sustNote = sustitutoLabelsById?.get(j.id) ?? null;
              return (
                <li key={j.id} className="liga-inscripciones__card is-inscrito">
                  <div className="liga-inscripciones__card-top">
                    <JugadorAvatar
                      fotoUrl={j.foto_url}
                      nombre={j.nombre}
                      size="lg"
                      className="liga-inscripciones__avatar"
                    />
                    <div className="liga-inscripciones__identity">
                      <div className="liga-inscripciones__identity-row">
                        <p className="liga-inscripciones__name">{j.nombre}</p>
                        {ligaEditable ? (
                          <TeActionMenu
                            label={`Acciones de ${j.nombre}`}
                            items={cardMenuItems(j)}
                            className="liga-inscripciones__card-menu"
                          />
                        ) : null}
                      </div>
                      <div className="liga-inscripciones__meta-row">
                        <span className="liga-inscripciones__status is-on">
                          <TablerIcon name="circle-check" size={14} />
                          Inscrito
                        </span>
                        {j.categoria ? (
                          <JugadorCategoriaBadge
                            categoria={j.categoria}
                            className="liga-inscripciones__cat"
                          />
                        ) : null}
                        {typeof j.nivel === "number" ? (
                          <span className="liga-inscripciones__nivel">
                            Nivel {j.nivel}
                          </span>
                        ) : null}
                      </div>
                      {sustNote ? (
                        <p className="liga-inscripciones__sust-note">{sustNote}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {inscritosTotalPages > 1 ? (
            <div className="liga-inscripciones__pager">
              <p className="liga-inscripciones__pager-meta">
                Mostrando {inscritosRangeStart}–{inscritosRangeEnd} de{" "}
                {inscritosFiltered.length}
              </p>
              <div className="liga-inscripciones__pager-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={inscritosSafePage <= 1}
                  onClick={() => setInscritosPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="liga-inscripciones__pager-page">
                  Página {inscritosSafePage} de {inscritosTotalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={inscritosSafePage >= inscritosTotalPages}
                  onClick={() =>
                    setInscritosPage((p) =>
                      Math.min(inscritosTotalPages, p + 1)
                    )
                  }
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Agregar jugador"
        size="lg"
        className="liga-inscripciones-add-modal"
        bodyClassName="liga-inscripciones-add-modal__body"
      >
        <p className="liga-inscripciones-add-modal__lead">
          Busca en el registro e inscribe jugadores disponibles. Los ya
          inscritos no aparecen aquí.
        </p>

        <div className="liga-inscripciones__search liga-inscripciones__search--modal">
          <TablerIcon
            name="search"
            size={18}
            className="liga-inscripciones__search-icon"
          />
          <input
            type="search"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar jugador disponible"
            autoComplete="off"
            autoFocus
          />
          {addQuery ? (
            <button
              type="button"
              className="liga-inscripciones__search-clear"
              onClick={() => setAddQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <TablerIcon name="x" size={16} />
            </button>
          ) : null}
        </div>

        <p className="liga-inscripciones__results" aria-live="polite">
          {disponiblesFiltered.length === 0
            ? "Sin disponibles"
            : `${disponiblesFiltered.length} disponible${
                disponiblesFiltered.length === 1 ? "" : "s"
              }`}
        </p>

        {jugadoresPool.length === 0 ? (
          <div className="liga-empty liga-inscripciones__empty">
            <p>Aún no hay jugadores en el registro.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setAddOpen(false);
                onGoToRegistro();
              }}
            >
              Ir al registro
            </Button>
          </div>
        ) : disponiblesFiltered.length === 0 ? (
          <div className="liga-empty liga-inscripciones__empty">
            <p>
              {addQuery.trim()
                ? "Ningún jugador coincide con la búsqueda."
                : totalDisponibles === 0
                  ? "Todos los jugadores del registro ya están inscritos."
                  : "Sin resultados."}
            </p>
          </div>
        ) : (
          <>
            <ul className="liga-inscripciones-add-list">
              {addPageItems.map((j) => {
                const cardBusy = pendingId === j.id;
                const disabled = busy || pendingId != null;
                return (
                  <li key={j.id} className="liga-inscripciones-add-list__row">
                    <JugadorAvatar
                      fotoUrl={j.foto_url}
                      nombre={j.nombre}
                      size="md"
                      className="liga-inscripciones__avatar"
                    />
                    <div className="liga-inscripciones-add-list__identity">
                      <p className="liga-inscripciones__name">{j.nombre}</p>
                      <div className="liga-inscripciones__meta-row">
                        {j.categoria ? (
                          <JugadorCategoriaBadge
                            categoria={j.categoria}
                            className="liga-inscripciones__cat"
                          />
                        ) : null}
                        {j.riviera_id ? (
                          <span className="liga-inscripciones__nivel">
                            {j.riviera_id}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={cardBusy}
                      disabled={disabled}
                      className="liga-inscripciones-add-list__action"
                      onClick={() => void handleToggle(j.id, false)}
                    >
                      Inscribir
                    </Button>
                  </li>
                );
              })}
            </ul>

            {addTotalPages > 1 ? (
              <div className="liga-inscripciones__pager">
                <p className="liga-inscripciones__pager-meta">
                  Mostrando {addRangeStart}–{addRangeEnd} de{" "}
                  {disponiblesFiltered.length}
                </p>
                <div className="liga-inscripciones__pager-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={addSafePage <= 1}
                    onClick={() => setAddPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="liga-inscripciones__pager-page">
                    Página {addSafePage} de {addTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={addSafePage >= addTotalPages}
                    onClick={() =>
                      setAddPage((p) => Math.min(addTotalPages, p + 1))
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Modal>
    </div>
  );
};

export default LigaInscripcionesPanel;
