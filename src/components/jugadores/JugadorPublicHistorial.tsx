import React, { useMemo, useState } from "react";
import type {
  JugadorParticipacion,
  JugadorTipoEvento,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";
import { filterParticipacionesHistorialVisible } from "../../lib/rivieraJugadores/historialDisplay";
import { TablerIcon } from "../ui/TablerIcon";
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

  const visibleParticipaciones = useMemo(
    () => filterParticipacionesHistorialVisible(participaciones),
    [participaciones]
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
    <section className="rjp-ficha-card rjp-ficha-historial">
      <header className="rjp-ficha-historial__head">
        <span className="rjp-ficha-historial__chip" aria-hidden>
          <TablerIcon name="trophy" size={16} />
        </span>
        <div>
          <h2 className="rjp-ficha-historial__title">Historial completo</h2>
          <p className="rjp-ficha-historial__sub">
            Retas, Round Robin, Torneos, Liga, Pádel Americano y más.
          </p>
        </div>
      </header>

      <div
        className="rjp-ficha-historial__tabs"
        role="tablist"
        aria-label="Filtrar historial"
      >
        {HISTORIAL_TABS.map((tab) => {
          const count = counts[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`rjp-ficha-historial__tab${
                isActive ? " rjp-ficha-historial__tab--active" : ""
              }`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
              {count > 0 ? (
                <span className="rjp-ficha-historial__tab-count">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="rjp-ficha-historial__body" role="tabpanel">
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
            <TablerIcon name="chevron-down" size={16} />
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
