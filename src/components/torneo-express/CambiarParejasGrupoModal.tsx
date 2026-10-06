import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";
import { buildGroupReassignment } from "../../lib/torneoExpress/reassignGroupPairs";
import {
  reorganizeGroups,
  reorganizeGroupsMessage,
  TorneoExpressGrupoOpError,
} from "../../services/torneoExpressGrupoOps";
import { Button } from "../ui";

type PairRow = {
  id: string;
  label: string;
  orden: number;
};

export interface CambiarParejasGrupoModalProps {
  open: boolean;
  torneoId: string;
  grupos: TorneoExpressGrupo[];
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>;
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>;
  onClose: () => void;
  onSaved: () => void;
}

function activePairs(
  grupo: TorneoExpressGrupo,
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>
): PairRow[] {
  return (parejasPorGrupo[grupo.id] ?? [])
    .filter((pareja) => pareja.activa !== false)
    .map((pareja) => ({
      id: pareja.pareja_id,
      label: pareja.pareja_display?.trim() || "Pareja",
      orden: grupo.orden,
    }));
}

export const CambiarParejasGrupoModal: React.FC<
  CambiarParejasGrupoModalProps
> = ({
  open,
  torneoId,
  grupos,
  parejasPorGrupo,
  partidosPorGrupo,
  onClose,
  onSaved,
}) => {
  const orderedGroups = useMemo(
    () => [...grupos].sort((a, b) => a.orden - b.orden),
    [grupos]
  );
  const initial = useMemo(() => {
    const map = new Map<string, number>();
    for (const grupo of orderedGroups) {
      for (const pair of activePairs(grupo, parejasPorGrupo)) {
        map.set(pair.id, grupo.orden);
      }
    }
    return map;
  }, [orderedGroups, parejasPorGrupo]);

  const [assignment, setAssignment] = useState<Map<string, number>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pairs = useMemo(
    () => orderedGroups.flatMap((grupo) => activePairs(grupo, parejasPorGrupo)),
    [orderedGroups, parejasPorGrupo]
  );
  const withdrawn = useMemo(
    () =>
      orderedGroups.some((grupo) =>
        (parejasPorGrupo[grupo.id] ?? []).some((pareja) => pareja.activa === false)
      ),
    [orderedGroups, parejasPorGrupo]
  );

  if (!open) return null;

  const current = assignment.size === initial.size ? assignment : initial;
  const played = Object.values(partidosPorGrupo)
    .flat()
    .some((partido) => partido.estado === "jugado");

  const save = async () => {
    if (played || withdrawn) {
      setError(
        played
          ? "No se pueden cambiar los grupos si ya hay resultados."
          : "No se pueden mover grupos mientras haya una pareja retirada."
      );
      return;
    }
    const moved = pairs.some((pair) => current.get(pair.id) !== pair.orden);
    if (!moved) {
      onClose();
      return;
    }
    const gruposDraft = orderedGroups.map((grupo) => ({
      orden: grupo.orden,
      nombre: grupo.nombre,
      parejaIds: pairs
        .filter((pair) => current.get(pair.id) === grupo.orden)
        .map((pair) => pair.id),
    }));
    const built = buildGroupReassignment({
      grupos: gruposDraft,
      existentes: Object.values(partidosPorGrupo)
        .flat()
        .map((partido) => ({
          localId: partido.pareja_local_id,
          visitanteId: partido.pareja_visitante_id,
          cancha: partido.cancha ?? null,
          programadoEn: partido.programado_en ?? null,
        })),
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await reorganizeGroups({ torneoId, payload: built.payload });
      onSaved();
    } catch (e) {
      const code = e instanceof TorneoExpressGrupoOpError ? e.code : "";
      setError(code ? reorganizeGroupsMessage(code) : "No se pudieron cambiar las parejas de grupo.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="te-define-pair-backdrop" role="presentation" onClick={onClose}>
      <div
        className="te-define-pair-dialog te-move-pairs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="te-move-pairs-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="te-define-pair-dialog__head">
          <h2 id="te-move-pairs-title">Cambiar parejas de grupo</h2>
          <button
            type="button"
            className="te-define-pair-dialog__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div className="te-define-pair-dialog__body">
          <p className="te-define-pair__lead">
            Elige el grupo de cada pareja. Los partidos pendientes se arman de
            nuevo y conservan el horario cuando el cruce sigue igual.
          </p>
          {played ? (
            <p className="te-error">
              No se pueden cambiar los grupos si ya hay resultados.
            </p>
          ) : null}
          {withdrawn ? (
            <p className="te-error">
              No se pueden mover grupos mientras haya una pareja retirada.
            </p>
          ) : null}
          {error ? <p className="te-error">{error}</p> : null}
          <div className="te-move-pairs__list">
            {orderedGroups.map((grupo) => {
              const rows = pairs.filter(
                (pair) => current.get(pair.id) === grupo.orden
              );
              return (
                <section key={grupo.id} className="te-move-pairs__group">
                  <h3>{grupo.nombre}</h3>
                  {rows.length === 0 ? (
                    <p className="te-define-pair__empty">Sin parejas.</p>
                  ) : (
                    rows.map((pair) => (
                      <label key={pair.id} className="te-move-pairs__row">
                        <span>{pair.label}</span>
                        <select
                          value={String(current.get(pair.id) ?? grupo.orden)}
                          disabled={saving || played || withdrawn}
                          aria-label={`Grupo de ${pair.label}`}
                          onChange={(event) => {
                            const orden = Number(event.target.value);
                            setAssignment((prev) => {
                              const base =
                                prev.size === initial.size ? prev : initial;
                              const next = new Map(base);
                              next.set(pair.id, orden);
                              return next;
                            });
                            setError("");
                          }}
                        >
                          {orderedGroups.map((option) => (
                            <option key={option.id} value={option.orden}>
                              {option.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))
                  )}
                </section>
              );
            })}
          </div>
        </div>
        <footer className="te-define-pair-dialog__foot">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            disabled={saving || played || withdrawn}
            onClick={() => void save()}
          >
            Guardar grupos
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
};
