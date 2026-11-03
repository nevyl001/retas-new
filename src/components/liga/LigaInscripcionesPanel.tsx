import React, { useEffect, useMemo, useState } from "react";
import type { LigaJugadorPoolItem } from "../../lib/liga/types";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import {
  filterLigaInscripcionesPool,
  LIGA_INSCRIPCIONES_PAGE_SIZE,
  paginateLigaInscripciones,
  type LigaInscripcionFilter,
} from "./ligaInscripcionesUtils";

export interface LigaInscripcionesPanelProps {
  jugadoresPool: LigaJugadorPoolItem[];
  inscritosIds: ReadonlySet<string>;
  ligaEditable: boolean;
  busy: boolean;
  onToggleInscripcion: (jugadorId: string, inscrito: boolean) => void | Promise<void>;
  onGoToRegistro: () => void;
}

const FILTERS: { id: LigaInscripcionFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "inscritos", label: "Inscritos" },
  { id: "sin_inscribir", label: "Sin inscribir" },
];

export const LigaInscripcionesPanel: React.FC<LigaInscripcionesPanelProps> = ({
  jugadoresPool,
  inscritosIds,
  ligaEditable,
  busy,
  onToggleInscripcion,
  onGoToRegistro,
}) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LigaInscripcionFilter>("todos");
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const totalInscritos = inscritosIds.size;
  const totalDisponibles = Math.max(0, jugadoresPool.length - totalInscritos);

  const filtered = useMemo(
    () =>
      filterLigaInscripcionesPool({
        jugadores: jugadoresPool,
        inscritosIds,
        query,
        filter,
      }),
    [jugadoresPool, inscritosIds, query, filter]
  );

  const { pageItems, page: safePage, totalPages } = useMemo(
    () => paginateLigaInscripciones(filtered, page, LIGA_INSCRIPCIONES_PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const handleFilterChange = (next: LigaInscripcionFilter) => {
    setFilter(next);
  };

  const handleToggle = async (jugadorId: string, inscrito: boolean) => {
    if (busy || pendingId) return;
    setPendingId(jugadorId);
    try {
      await onToggleInscripcion(jugadorId, inscrito);
    } finally {
      setPendingId(null);
    }
  };

  const rangeStart =
    filtered.length === 0 ? 0 : (safePage - 1) * LIGA_INSCRIPCIONES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    safePage * LIGA_INSCRIPCIONES_PAGE_SIZE,
    filtered.length
  );

  return (
    <div className="liga-card rv-card liga-inscripciones">
      <header className="liga-inscripciones__header">
        <div>
          <h2 className="liga-inscripciones__title">Jugadores de la liga</h2>
          <p className="liga-inscripciones__subtitle">
            Busca, consulta y administra las inscripciones.
          </p>
        </div>
      </header>

      <div className="liga-inscripciones__stats" aria-label="Resumen de inscripciones">
        <div className="liga-inscripciones__stat">
          <span className="liga-inscripciones__stat-label">Inscritos</span>
          <strong className="liga-inscripciones__stat-value">{totalInscritos}</strong>
        </div>
        <div className="liga-inscripciones__stat">
          <span className="liga-inscripciones__stat-label">Disponibles</span>
          <strong className="liga-inscripciones__stat-value">{totalDisponibles}</strong>
        </div>
        <div className="liga-inscripciones__stat">
          <span className="liga-inscripciones__stat-label">En registro</span>
          <strong className="liga-inscripciones__stat-value">
            {jugadoresPool.length}
          </strong>
        </div>
      </div>

      <div className="liga-inscripciones__controls">
        <div className="liga-inscripciones__search">
          <TablerIcon
            name="search"
            size={18}
            className="liga-inscripciones__search-icon"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jugador por nombre..."
            aria-label="Buscar jugador por nombre"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="liga-inscripciones__search-clear"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <TablerIcon name="x" size={16} />
            </button>
          ) : null}
        </div>

        <div
          className="liga-inscripciones__filters"
          role="tablist"
          aria-label="Filtrar por estado de inscripción"
        >
          {FILTERS.map((item) => {
            const selected = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`liga-inscripciones__filter${
                  selected ? " is-active" : ""
                }`}
                onClick={() => handleFilterChange(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="liga-inscripciones__results" aria-live="polite">
        {filtered.length === 0
          ? "Sin resultados"
          : `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`}
        {query.trim() ? ` para “${query.trim()}”` : null}
      </p>

      {jugadoresPool.length === 0 ? (
        <div className="liga-empty liga-inscripciones__empty">
          <p>Aún no hay jugadores en el registro.</p>
          <Button type="button" variant="secondary" size="sm" onClick={onGoToRegistro}>
            Ir al registro de jugadores
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="liga-empty liga-inscripciones__empty">
          <p>No hay jugadores que coincidan con la búsqueda o el filtro.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilter("todos");
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <>
          <ul className="liga-inscripciones__grid">
            {pageItems.map((j) => {
              const inscrito = inscritosIds.has(j.id);
              const cardBusy = pendingId === j.id;
              const disabled = busy || pendingId != null;
              return (
                <li
                  key={j.id}
                  className={`liga-inscripciones__card${
                    inscrito ? " is-inscrito" : ""
                  }`}
                >
                  <div className="liga-inscripciones__card-top">
                    <JugadorAvatar
                      fotoUrl={j.foto_url}
                      nombre={j.nombre}
                      size="md"
                      className="liga-inscripciones__avatar"
                    />
                    <div className="liga-inscripciones__identity">
                      <p className="liga-inscripciones__name">{j.nombre}</p>
                      <div className="liga-inscripciones__meta-row">
                        {j.categoria ? (
                          <JugadorCategoriaBadge
                            categoria={j.categoria}
                            className="liga-inscripciones__cat"
                          />
                        ) : (
                          <span className="liga-inscripciones__cat-missing">
                            Sin categoría
                          </span>
                        )}
                        {typeof j.nivel === "number" ? (
                          <span className="liga-inscripciones__nivel">
                            Nivel {j.nivel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="liga-inscripciones__card-bottom">
                    <span
                      className={`liga-inscripciones__status${
                        inscrito ? " is-on" : ""
                      }`}
                    >
                      {inscrito ? (
                        <>
                          <TablerIcon name="circle-check" size={15} />
                          Inscrito
                        </>
                      ) : (
                        "Sin inscribir"
                      )}
                    </span>

                    {ligaEditable ? (
                      <Button
                        type="button"
                        variant={inscrito ? "secondary" : "primary"}
                        size="sm"
                        loading={cardBusy}
                        disabled={disabled}
                        className="liga-inscripciones__action"
                        onClick={() => void handleToggle(j.id, inscrito)}
                      >
                        {inscrito ? "Quitar" : "Inscribir jugador"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="liga-inscripciones__pager">
              <p className="liga-inscripciones__pager-meta">
                Mostrando {rangeStart}–{rangeEnd} de {filtered.length}
              </p>
              <div className="liga-inscripciones__pager-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="liga-inscripciones__pager-page">
                  Página {safePage} de {totalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default LigaInscripcionesPanel;
