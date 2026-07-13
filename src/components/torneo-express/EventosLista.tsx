import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TorneoExpress,
  TorneoExpressEvento,
} from "../../lib/torneoExpress/types";
import { resolveEventoEstadoFromCategorias } from "../../lib/torneoExpress/eventoEstadoFromCategorias";
import {
  deleteEvento,
  fetchEventosByOrganizador,
  fetchTorneosExpressByOrganizador,
  formatSupabaseError,
  syncEventoEstadoFromCategorias,
} from "../../services/torneoExpressService";
import { Badge, Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { useClubModeEyebrow } from "../../club-experience";
import { TePageShell } from "./TePageShell";
import { CrearEventoModal } from "./CrearEventoModal";
import { EventoDeleteModal } from "./EventoDeleteModal";
import { navigateTorneoExpress } from "./torneoExpressNav";
import "./te-eventos.css";
import "./te-inicio-page.css";
import "./te-fondos.css";

function formatFecha(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatFechaCard(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isEventoActivo(estado: TorneoExpressEvento["estado"]): boolean {
  return estado === "published" || estado === "in_progress";
}

function isEventoFinalizado(estado: TorneoExpressEvento["estado"]): boolean {
  return estado === "completed" || estado === "archived";
}

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

  const activos = useMemo(
    () => eventos.filter((e) => isEventoActivo(e.estado)),
    [eventos]
  );
  const finalizados = useMemo(
    () => eventos.filter((e) => isEventoFinalizado(e.estado)),
    [eventos]
  );
  const otros = useMemo(
    () =>
      eventos.filter(
        (e) => !isEventoActivo(e.estado) && !isEventoFinalizado(e.estado)
      ),
    [eventos]
  );

  const empty = useMemo(
    () => !loading && eventos.length === 0,
    [loading, eventos.length]
  );

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

  const renderEventoCard = (ev: TorneoExpressEvento) => {
    const nCat = (categoriasByEvento[ev.id] ?? []).length;
    const activo = isEventoActivo(ev.estado);
    const finalizado = isEventoFinalizado(ev.estado);
    const fi = formatFecha(ev.fecha_inicio);
    const ff = formatFecha(ev.fecha_fin);
    const rango = [fi, ff].filter(Boolean).join(" – ");
    const fechaTop =
      formatFecha(ev.fecha_inicio) ||
      formatFechaCard(ev.created_at);

    return (
      <li
        key={ev.id}
        className={`te-torneo-card rv-card${
          activo ? " te-torneo-card--activo" : " te-torneo-card--finalizado"
        }`}
      >
        <div className="te-torneo-card__inner">
          <div className="te-torneo-card__body">
            <div className="te-torneo-card__meta-top">
              {activo ? (
                <Badge variant="live" className="te-torneo-card__badge-live">
                  {ev.estado === "in_progress" ? "EN CURSO" : "PUBLICADO"}
                </Badge>
              ) : finalizado ? (
                <Badge variant="finished" className="te-torneo-card__badge-done">
                  FINALIZADO
                </Badge>
              ) : (
                <Badge variant="pending" className="te-torneo-card__badge-done">
                  BORRADOR
                </Badge>
              )}
              <span className="te-torneo-card__fecha">{fechaTop}</span>
            </div>

            <h3 className="te-torneo-card__nombre">{ev.nombre}</h3>
            <p className="te-torneo-card__meta-line">
              {rango ? (
                <>
                  <span>{rango}</span>
                  <span className="te-torneo-card__meta-sep" aria-hidden>
                    ·
                  </span>
                </>
              ) : null}
              <span>
                {nCat === 1 ? "1 categoría" : `${nCat} categorías`}
              </span>
            </p>
          </div>

          <footer className="te-torneo-card__footer">
            <div className="te-torneo-card__actions-bar">
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="te-torneo-card__btn-manage"
                onClick={() =>
                  navigateTorneoExpress(`/torneo-express/evento/${ev.id}`)
                }
              >
                Abrir
              </Button>

              <div className="te-torneo-card__actions-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="te-btn-eliminar-torneo"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(ev)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          </footer>
        </div>
      </li>
    );
  };

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

        <div className="te-eventos-toolbar">
          <Button
            type="button"
            variant="primary"
            onClick={() => setCreateOpen(true)}
          >
            Crear evento
          </Button>
        </div>

        {error ? <p className="te-error">{error}</p> : null}

        <section
          className="te-torneos-section"
          aria-labelledby="te-eventos-list-heading"
        >
          <div className="te-torneos-section__head">
            <h2
              id="te-eventos-list-heading"
              className="te-torneos-section__title rv-section-title"
            >
              Tus eventos
            </h2>
            {!loading && activos.length > 0 ? (
              <span className="te-torneos-section__count">
                {activos.length} {activos.length === 1 ? "activo" : "activos"}
              </span>
            ) : null}
          </div>

          {loading ? (
            <ul className="te-torneos-skeleton" aria-busy="true">
              <li className="te-torneos-skeleton__card" />
              <li className="te-torneos-skeleton__card" />
            </ul>
          ) : null}

          {empty ? (
            <div className="te-torneos-empty">
              <p>Aún no tienes eventos.</p>
              <p>Crea uno con «Crear evento» para comenzar.</p>
            </div>
          ) : null}

          {!loading && activos.length > 0 ? (
            <div className="te-torneos-group">
              <h3 className="te-torneos-group__label">En curso</h3>
              <ul className="te-torneos-cards">{activos.map(renderEventoCard)}</ul>
            </div>
          ) : null}

          {!loading && otros.length > 0 ? (
            <div className="te-torneos-group">
              <h3 className="te-torneos-group__label">Otros</h3>
              <ul className="te-torneos-cards">{otros.map(renderEventoCard)}</ul>
            </div>
          ) : null}

          {!loading && finalizados.length > 0 ? (
            <div className="te-torneos-group">
              <h3 className="te-torneos-group__label">Finalizados</h3>
              <ul className="te-torneos-cards">
                {finalizados.map(renderEventoCard)}
              </ul>
            </div>
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
