import React, { useMemo } from "react";
import type { GrupoAssignmentDraft } from "../../lib/torneoExpress/types";
import type { ParejaDraft } from "./crearTorneoExpressTypes";

export interface AsignarParejasGruposProps {
  parejas: ParejaDraft[];
  assignments: GrupoAssignmentDraft[];
  assignedIds: Set<string>;
  onAssignmentsChange: (
    updater: (prev: GrupoAssignmentDraft[]) => GrupoAssignmentDraft[]
  ) => void;
  onTogglePair: (grupoIndex: number, pairId: string) => void;
}

export const AsignarParejasGrupos: React.FC<AsignarParejasGruposProps> = ({
  parejas,
  assignments,
  assignedIds,
  onAssignmentsChange,
  onTogglePair,
}) => {
  const unassigned = useMemo(
    () => parejas.filter((p) => !assignedIds.has(p.id)),
    [parejas, assignedIds]
  );

  if (parejas.length < 2) {
    return null;
  }

  return (
    <section className="te-asignar-grupos">
      <div className="te-armar-parejas__step">
        <span className="te-armar-parejas__step-num" aria-hidden>
          2
        </span>
        <div>
          <h2 className="te-section-title">Repartir en grupos</h2>
          <p className="te-subtitle">
            Pulsa cada pareja para asignarla a un grupo. Mínimo 2 parejas por
            grupo. Una pareja solo puede estar en un grupo.
          </p>
        </div>
      </div>

      {unassigned.length > 0 ? (
        <p className="te-asignar-grupos__warn" role="status">
          Sin grupo: {unassigned.map((p) => `${p.jugador1.name} / ${p.jugador2.name}`).join(" · ")}
        </p>
      ) : (
        <p className="te-asignar-grupos__ok" role="status">
          Todas las parejas tienen grupo asignado.
        </p>
      )}

      {assignments.map((grupo, gi) => (
        <div key={grupo.orden} className="te-grupo-assignment">
          <div className="torneo-express-field te-grupo-assignment__name">
            <label htmlFor={`te-grupo-nombre-${gi}`}>Nombre del grupo</label>
            <input
              id={`te-grupo-nombre-${gi}`}
              value={grupo.nombre}
              onChange={(e) =>
                onAssignmentsChange((prev) =>
                  prev.map((g, i) =>
                    i === gi ? { ...g, nombre: e.target.value } : g
                  )
                )
              }
            />
          </div>
          <p className="te-subtitle te-grupo-assignment__count">
            {grupo.parejaIds.length} pareja
            {grupo.parejaIds.length === 1 ? "" : "s"} en este grupo
            {grupo.parejaIds.length < 2 ? " (mín. 2)" : ""}
          </p>
          <div className="te-pareja-pool" role="group" aria-label={`Parejas en ${grupo.nombre}`}>
            {parejas.map((p) => {
              const label = `${p.jugador1.name} / ${p.jugador2.name}`;
              const inThis = grupo.parejaIds.includes(p.id);
              const inOther = !inThis && assignedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`te-pareja-chip${inThis ? " te-pareja-chip--selected" : ""}${
                    inOther ? " te-pareja-chip--assigned" : ""
                  }`}
                  disabled={inOther}
                  aria-pressed={inThis}
                  onClick={() => onTogglePair(gi, p.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
};
