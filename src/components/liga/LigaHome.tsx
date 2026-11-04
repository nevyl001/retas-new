import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { navigateToAppHome } from "../../lib/appRouting";
import type { Liga } from "../../lib/liga/types";
import { deleteLiga, getLigas } from "../../services/ligaService";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateLiga } from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import {
  LigaListaCard,
  type LigaListaFilter,
} from "./LigaListaCard";
import "./liga-page.css";
import "../torneo-express/te-action-menu.css";

const FILTERS: Array<{ id: LigaListaFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "in_progress", label: "En curso" },
  { id: "completed", label: "Finalizadas" },
];

function matchesFilter(liga: Liga, filter: LigaListaFilter): boolean {
  if (filter === "all") return true;
  return liga.estado === filter;
}

export const LigaHome: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const [ligas, setLigas] = useState<Liga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LigaListaFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getLigas();
      setLigas(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ligas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: ligas.length,
      in_progress: ligas.filter((l) => l.estado === "in_progress").length,
      completed: ligas.filter((l) => l.estado === "completed").length,
    }),
    [ligas]
  );

  const visible = useMemo(
    () => ligas.filter((l) => matchesFilter(l, filter)),
    [ligas, filter]
  );

  const handleDeleteLiga = async (liga: Liga) => {
    if (
      !window.confirm(
        `¿Eliminar «${liga.nombre}»? Se borrarán inscripciones, jornadas y resultados. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setDeletingId(liga.id);
    setError(null);
    try {
      await deleteLiga(liga.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la liga");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <LigaPageShell className="liga-home">
      <ActionBar className="liga-toolbar riviera-back-toolbar liga-home__back">
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          ← Volver al inicio
        </Button>
      </ActionBar>

      <div className="liga-home__intro">
        <ModeHeader
          className="liga-header rv-mode-header rv-mode-header--entry liga-home__header"
          eyebrow={modeEyebrow}
          title="Mis ligas"
          subtitle="Organiza y administra tus competiciones"
        />
        <Button
          type="button"
          variant="primary"
          className="liga-home__create"
          onClick={() => navigateLiga("/liga/nueva")}
        >
          <TablerIcon name="plus" size={18} />
          Nueva liga
        </Button>
      </div>

      {!loading && ligas.length > 0 ? (
        <div
          className="liga-home__filters"
          role="tablist"
          aria-label="Filtrar ligas"
        >
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`liga-home__chip${active ? " is-active" : ""}`}
                onClick={() => setFilter(item.id)}
              >
                <span>{item.label}</span>
                <span className="liga-home__chip-count">{counts[item.id]}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="liga-error liga-home__error">{error}</p> : null}

      {loading ? (
        <p className="liga-subtitle liga-home__status">Cargando ligas…</p>
      ) : ligas.length === 0 ? (
        <div className="liga-card liga-empty rv-card rv-empty-state liga-home__empty">
          <p>No tienes ligas creadas. Usa «Nueva liga» para empezar.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="liga-card liga-empty rv-card rv-empty-state liga-home__empty">
          <p>No hay ligas en este filtro.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setFilter("all")}
          >
            Ver todas
          </Button>
        </div>
      ) : (
        <ul className="liga-home__grid">
          {visible.map((liga) => (
            <LigaListaCard
              key={liga.id}
              liga={liga}
              deleting={deletingId === liga.id}
              deleteDisabled={deletingId !== null}
              onManage={() => navigateLiga(`/liga/${liga.id}/gestionar`)}
              onDelete={() => void handleDeleteLiga(liga)}
            />
          ))}
        </ul>
      )}
    </LigaPageShell>
  );
};
