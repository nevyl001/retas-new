import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TorneoExpress,
  TorneoExpressEvento,
} from "../../lib/torneoExpress/types";
import { resolveEventoEstadoFromCategorias } from "../../lib/torneoExpress/eventoEstadoFromCategorias";
import {
  classifyEventoTemporal,
  EVENTO_FILTROS,
  filterEventos,
  summarizeEventos,
  type EventoFiltro,
} from "../../lib/torneoExpress/eventoTemporal";
import {
  deleteEvento,
  fetchEventosByOrganizador,
  fetchTorneosExpressByOrganizador,
  formatSupabaseError,
  syncEventoEstadoFromCategorias,
} from "../../services/torneoExpressService";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { useClubModeEyebrow } from "../../club-experience";
import { TePageShell } from "./TePageShell";
import { CrearEventoModal } from "./CrearEventoModal";
import { EventoDeleteModal } from "./EventoDeleteModal";
import { EventoListaCard } from "./EventoListaCard";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-eventos.css";
import "./te-inicio-page.css";
import "./te-fondos.css";
import "./te-eventos-lista.css";

/** Con pocos eventos el buscador sobra; aparece cuando la lista empieza a crecer. */
const SEARCH_MIN_EVENTOS = 4;

const FILTRO_EMPTY_LABEL: Record<Exclude<EventoFiltro, "todos">, string> = {
  en_curso: "en curso",
  proximo: "próximos",
  borrador: "en borrador",
  finalizado: "finalizados",
};

export const EventosLista: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const [eventos, setEventos] = useState<TorneoExpressEvento[]>([]);
  const [categoriasByEvento, setCategoriasByEvento] = useState<
    Record<string, TorneoExpress[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TorneoExpressEvento | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [filtro, setFiltro] = useState<EventoFiltro>("todos");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, torneos] = await Promise.all([
        fetchEventosByOrganizador(),
        fetchTorneosExpressByOrganizador({ standaloneOnly: false }).catch(
          () => []
        ),
      ]);
      const byEvento: Record<string, TorneoExpress[]> = {};
      for (const t of torneos) {
        const eid = t.evento_id?.trim();
        if (!eid) continue;
        if (!byEvento[eid]) byEvento[eid] = [];
        byEvento[eid].push(t);
      }
      setCategoriasByEvento(byEvento);

      const resolved = list.map((ev) => {
        const cats = byEvento[ev.id] ?? [];
        const estado = resolveEventoEstadoFromCategorias(ev.estado, cats);
        return estado === ev.estado ? ev : { ...ev, estado };
      });
      setEventos(resolved);

      void Promise.all(
        resolved
          .filter((ev, i) => ev.estado !== list[i]?.estado)
          .map((ev) => syncEventoEstadoFromCategorias(ev.id).catch(() => null))
      );
    } catch (e) {
      setError(formatSupabaseError(e));
      setEventos([]);
      setCategoriasByEvento({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Clasificación temporal por zona horaria del evento (ver eventoTemporal.ts).
  // Los contadores de los filtros y la lista salen de la misma función.
  const resumen = useMemo(() => summarizeEventos(eventos), [eventos]);
  const visibles = useMemo(
    () => filterEventos(eventos, { filtro, query }),
    [eventos, filtro, query]
  );

  const hasEventos = !loading && eventos.length > 0;
  const showSearch = hasEventos && eventos.length >= SEARCH_MIN_EVENTOS;
  const isFiltering = filtro !== "todos" || query.trim() !== "";

  const clearFilters = () => {
    setFiltro("todos");
    setQuery("");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    setError(null);
    try {
      await deleteEvento(id);
      setEventos((prev) => prev.filter((e) => e.id !== id));
      setCategoriasByEvento((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeleteTarget(null);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setDeleting(false);
    }
  };

  const countFor = (id: EventoFiltro): number =>
    id === "todos" ? resumen.total : resumen[id];

  return (
    <TePageShell className="te-inicio-page te-eventos-page">
      <div className="te-inicio-page__shell">
        <ActionBar className="te-inicio-toolbar riviera-back-toolbar">
          <Button
            type="button"
            variant="back"
            onClick={() => navigateTorneoExpress("/torneo-express")}
          >
            ← Volver a Torneos
          </Button>
        </ActionBar>

        <div className="te-inicio-page__intro">
          <ModeHeader
            className="te-inicio-header te-header rv-mode-header rv-mode-header--entry"
            eyebrow={modeEyebrow}
            title="Eventos"
            subtitle="Agrupa varias categorías (torneos) bajo un mismo evento. Cada categoría se arma y compite por separado."
          />
        </div>

        <section className="te-ev" aria-labelledby="te-eventos-list-heading">
          <div className="te-ev__head">
            <h2 id="te-eventos-list-heading" className="te-ev__title">
              Tus eventos
            </h2>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="te-ev__create"
              onClick={() => setCreateOpen(true)}
            >
              <TablerIcon name="plus" size={16} />
              Crear evento
            </Button>
          </div>

          {error ? (
            <div className="te-ev__error" role="alert">
              <p>{error}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void load()}
              >
                Reintentar
              </Button>
            </div>
          ) : null}

          {hasEventos ? (
            <div className="te-ev__controls">
              <div
                className="te-ev__filters"
                role="group"
                aria-label="Filtrar eventos por estado"
              >
                {EVENTO_FILTROS.map(({ id, label }) => {
                  const count = countFor(id);
                  const active = filtro === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`te-ev__chip${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setFiltro(id)}
                    >
                      {label}
                      <span className="te-ev__chip-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {showSearch ? (
                <div className="te-ev__search">
                  <TablerIcon name="search" size={16} className="te-ev__search-icon" />
                  <input
                    type="search"
                    className="te-ev__search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar evento"
                    aria-label="Buscar evento por nombre"
                    autoComplete="off"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <ul className="te-ev__grid" aria-busy="true" aria-label="Cargando eventos">
              {[0, 1, 2].map((i) => (
                <li key={i} className="te-ev-skeleton" aria-hidden>
                  <div className="te-ev-skeleton__media" />
                  <div className="te-ev-skeleton__body">
                    <span className="te-ev-skeleton__line te-ev-skeleton__line--title" />
                    <span className="te-ev-skeleton__line" />
                    <span className="te-ev-skeleton__line te-ev-skeleton__line--short" />
                  </div>
                  <div className="te-ev-skeleton__footer" />
                </li>
              ))}
            </ul>
          ) : null}

          {!loading && eventos.length === 0 && !error ? (
            <div className="te-ev__empty">
              <TablerIcon name="trophy" size={28} className="te-ev__empty-icon" />
              <h3 className="te-ev__empty-title">Aún no tienes eventos</h3>
              <p className="te-ev__empty-text">
                Crea tu primer evento para agrupar categorías bajo un mismo
                flyer, fechas y reglas.
              </p>
              <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
                Crear evento
              </Button>
            </div>
          ) : null}

          {hasEventos && visibles.length === 0 ? (
            <div className="te-ev__empty te-ev__empty--filtered">
              <h3 className="te-ev__empty-title">
                {query.trim()
                  ? "Sin resultados"
                  : filtro !== "todos"
                    ? `No tienes eventos ${FILTRO_EMPTY_LABEL[filtro]}`
                    : "Sin eventos"}
              </h3>
              <p className="te-ev__empty-text">
                {query.trim()
                  ? "Ningún evento coincide con tu búsqueda en este filtro."
                  : "Cambia el filtro para ver el resto de tus eventos."}
              </p>
              {isFiltering ? (
                <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                  Ver todos los eventos
                </Button>
              ) : null}
            </div>
          ) : null}

          {hasEventos && visibles.length > 0 ? (
            <>
              <p className="te-ev__sr-status" role="status" aria-live="polite">
                {visibles.length === 1
                  ? "1 evento"
                  : `${visibles.length} eventos`}
              </p>
              <ul className="te-ev__grid">
                {visibles.map((ev) => (
                  <EventoListaCard
                    key={ev.id}
                    evento={ev}
                    categoriaCount={(categoriasByEvento[ev.id] ?? []).length}
                    temporal={classifyEventoTemporal(ev)}
                    deleting={deleting}
                    onManage={() =>
                      navigateTorneoExpress(`/torneo-express/evento/${ev.id}`)
                    }
                    onDelete={() => setDeleteTarget(ev)}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>

      <CrearEventoModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          navigateTorneoExpress(`/torneo-express/evento/${id}`);
        }}
      />

      {deleteTarget ? (
        <EventoDeleteModal
          eventoNombre={deleteTarget.nombre}
          categoriaCount={(categoriasByEvento[deleteTarget.id] ?? []).length}
          deleting={deleting}
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </TePageShell>
  );
};
