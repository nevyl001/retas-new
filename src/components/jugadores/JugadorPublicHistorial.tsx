import React, { useMemo, useState } from "react";
import type {
  JugadorParticipacion,
  JugadorTipoEvento,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";
import { filterParticipacionesHistorialVisible } from "../../lib/rivieraJugadores/historialDisplay";
import { JugadorHistorialList } from "./JugadorHistorialList";

type HistorialTab = "todos" | "torneos" | "liga" | "americano" | "retas";

const HISTORIAL_TABS: { id: HistorialTab; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "torneos", label: "Torneos" },
  { id: "liga", label: "Liga" },
  { id: "americano", label: "Americano" },
  { id: "retas", label: "Retas" },
];

const PAGE_SIZE = 6;

function matchesHistorialTab(
  tipo: JugadorTipoEvento,
  tab: HistorialTab
): boolean {
  switch (tab) {
    case "todos":
      return true;
    case "torneos":
      return tipo === "torneo_express";
    case "liga":
      return tipo === "liga";
    case "americano":
      return tipo === "americano";
    case "retas":
      return tipo === "reta" || tipo === "duelo_2v2";
    default:
      return true;
  }
}

interface JugadorPublicHistorialProps {
  participaciones: JugadorParticipacion[];
  otrosClubesParticipaciones?: JugadorParticipacion[];
  categoriaFallback?: RivieraJugadorCategoria;
}

export const JugadorPublicHistorial: React.FC<JugadorPublicHistorialProps> = ({
  participaciones,
  otrosClubesParticipaciones = [],
  categoriaFallback,
}) => {
  const [activeTab, setActiveTab] = useState<HistorialTab>("todos");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const mergedParticipaciones = useMemo(() => {
    const seen = new Set<string>();
    const merged: JugadorParticipacion[] = [];
    for (const row of [...participaciones, ...otrosClubesParticipaciones]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    return merged;
  }, [participaciones, otrosClubesParticipaciones]);

  const visibleParticipaciones = useMemo(
    () => filterParticipacionesHistorialVisible(mergedParticipaciones),
    [mergedParticipaciones]
  );

  const counts = useMemo(() => {
    const base: Record<HistorialTab, number> = {
      todos: visibleParticipaciones.length,
      torneos: 0,
      liga: 0,
      americano: 0,
      retas: 0,
    };
    for (const row of visibleParticipaciones) {
      if (row.tipo_evento === "torneo_express") base.torneos += 1;
      if (row.tipo_evento === "liga") base.liga += 1;
      if (row.tipo_evento === "americano") base.americano += 1;
      if (row.tipo_evento === "reta" || row.tipo_evento === "duelo_2v2") {
        base.retas += 1;
      }
    }
    return base;
  }, [visibleParticipaciones]);

  const filtered = useMemo(
    () =>
      visibleParticipaciones.filter((row) =>
        matchesHistorialTab(row.tipo_evento, activeTab)
      ),
    [visibleParticipaciones, activeTab]
  );

  const pageSize = PAGE_SIZE;

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  const handleTabChange = (tab: HistorialTab) => {
    setActiveTab(tab);
    setVisibleCount(pageSize);
  };

  return (
    <section className="rjp-ficha-historial" aria-label="Historial de carrera">
      <header className="rjp-ficha-historial__head">
        <h2 className="rjp-ficha-historial__title">Historial de carrera</h2>
      </header>

      <div
        className="rjp-ficha-historial__tabs"
        role="tablist"
        aria-label="Filtrar historial por modalidad"
      >
        {HISTORIAL_TABS.map((tab) => {
          const count = counts[tab.id];
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`rjp-hist-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="rjp-hist-panel"
              className={`rjp-ficha-historial__tab${
                selected ? " rjp-ficha-historial__tab--active" : ""
              }`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
              {count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div
        id="rjp-hist-panel"
        className="rjp-ficha-historial__body"
        role="tabpanel"
        aria-labelledby={`rjp-hist-tab-${activeTab}`}
        aria-live="polite"
      >
        <JugadorHistorialList
          participaciones={visible}
          categoriaFallback={categoriaFallback}
          variant="public"
          showResumen={false}
        />

        {hasMore ? (
          <button
            type="button"
            className="rjp-ficha-historial__more"
            onClick={() => setVisibleCount((n) => n + pageSize)}
          >
            Ver más ({filtered.length - visible.length} restantes)
          </button>
        ) : null}
      </div>

      {otrosClubesParticipaciones.length > 0 ? (
        <div className="rjp-ficha-historial__otros-clubes">
          <p className="rjp-ficha-historial__otros-label">Otros clubes</p>
          <JugadorHistorialList
            participaciones={otrosClubesParticipaciones}
            categoriaFallback={categoriaFallback}
            variant="public"
            showResumen={false}
          />
        </div>
      ) : null}
    </section>
  );
};
