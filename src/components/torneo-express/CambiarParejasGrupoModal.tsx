import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parejaTieneHistorial } from "../../lib/torneoExpress/partidoHistorial";
import { planReasignacion } from "../../lib/torneoExpress/reasignacionGrupos";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";
import { reasignarParejasGrupos } from "../../services/torneoExpressReasignarGrupos";
import { Button } from "../ui";

type PairRow = {
  id: string;
  label: string;
  grupoId: string;
};

export interface CambiarParejasGrupoModalProps {
  open: boolean;
  torneoId: string;
  grupos: TorneoExpressGrupo[];
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>;
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
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
      grupoId: grupo.id,
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
  const pairLock = useMemo(() => {
    const locks = new Map<string, "resultado" | "retirada">();
    for (const grupo of orderedGroups) {
      const partidos = partidosPorGrupo[grupo.id] ?? [];
      for (const pareja of parejasPorGrupo[grupo.id] ?? []) {
        if (pareja.activa === false) {
          locks.set(pareja.pareja_id, "retirada");
          continue;
        }
        if (parejaTieneHistorial(partidos, pareja.pareja_id)) {
          locks.set(pareja.pareja_id, "resultado");
        }
      }
    }
    return locks;
  }, [orderedGroups, parejasPorGrupo, partidosPorGrupo]);
  const initial = useMemo(() => {
    const map = new Map<string, string>();
    for (const grupo of orderedGroups) {
      for (const pair of activePairs(grupo, parejasPorGrupo)) {
        map.set(pair.id, grupo.id);
      }
    }
    return map;
  }, [orderedGroups, parejasPorGrupo]);

  const [changes, setChanges] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const current = useMemo(() => {
    const next = new Map(initial);
    changes.forEach((grupoId, pairId) => {
      if (next.has(pairId)) next.set(pairId, grupoId);
    });
    return next;
  }, [changes, initial]);

  if (!open) return null;

  const movableCount = Array.from(initial.keys()).filter(
    (pairId) => !pairLock.has(pairId)
  ).length;
  const canMove = orderedGroups.length >= 2 && movableCount > 0;
  const blocked = !canMove || saving;

  const save = async () => {
    if (savingRef.current || !canMove) return;
    const desired = new Map<string, string[]>();
    const currentByGroup = new Map<string, string[]>();
    for (const grupo of orderedGroups) {
      desired.set(grupo.id, []);
      currentByGroup.set(
        grupo.id,
        activePairs(grupo, parejasPorGrupo).map((pair) => pair.id)
      );
    }
    current.forEach((grupoId, pairId) => desired.get(grupoId)?.push(pairId));

    const planned = planReasignacion({
      grupos: orderedGroups,
      desired,
      current: currentByGroup,
      partidosPorGrupo,
    });
    if (!planned.ok) {
      setError(planned.error);
      return;
    }
    if (!planned.plan) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await reasignarParejasGrupos({ torneoId, ...planned.plan });
      await onSaved();
      onClose();
    } catch (e) {
      savingRef.current = false;
      setSaving(false);
      const detail = e instanceof Error ? e.message.trim() : "";
      setError(detail || "No se pudieron cambiar las parejas de grupo.");
    }
  };

  return createPortal(
    <div
      className="te-define-pair-backdrop"
      role="presentation"
      onClick={saving ? undefined : onClose}
    >
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
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div className="te-define-pair-dialog__body">
          <p className="te-define-pair__lead">
            Puedes cambiar de grupo a una pareja mientras no tenga resultados.
            Las que ya jugaron se quedan en su grupo. Los partidos pendientes se
            arman de nuevo y los resultados capturados se conservan.
          </p>
          <div className="te-move-pairs__list">
            {orderedGroups.map((grupo) => {
              const rows = Array.from(current.entries())
                .filter(([, grupoId]) => grupoId === grupo.id)
                .map(([pairId]) => {
                  const label = orderedGroups
                    .flatMap((g) => activePairs(g, parejasPorGrupo))
                    .find((pair) => pair.id === pairId)?.label;
                  return { id: pairId, label: label ?? "Pareja" };
                });
              return (
                <section key={grupo.id} className="te-move-pairs__group">
                  <h3>{grupo.nombre}</h3>
                  {rows.length === 0 ? (
                    <p className="te-define-pair__empty">Sin parejas.</p>
                  ) : (
                    rows.map((pair) => {
                      const lock = pairLock.get(pair.id);
                      if (lock) {
                        return (
                          <div key={pair.id} className="te-move-pairs__row">
                            <span>{pair.label}</span>
                            <span className="te-define-pair__empty">
                              {lock === "retirada"
                                ? "Retirada."
                                : "Ya tiene resultado."}
                            </span>
                          </div>
                        );
                      }
                      return (
                      <label key={pair.id} className="te-move-pairs__row">
                        <span>{pair.label}</span>
                        <select
                          value={current.get(pair.id) ?? grupo.id}
                          disabled={blocked}
                          aria-label={`Grupo de ${pair.label}`}
                          onChange={(event) => {
                            const grupoId = event.target.value;
                            setChanges((prev) => {
                              const next = new Map(prev);
                              next.set(pair.id, grupoId);
                              return next;
                            });
                            setError("");
                          }}
                        >
                          {orderedGroups.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                      );
                    })
                  )}
                </section>
              );
            })}
          </div>
        </div>
        <footer className="te-define-pair-dialog__foot">
          {!canMove ? (
            <p className="te-error te-move-pairs__error">
              {orderedGroups.length < 2
                ? "Necesitas al menos 2 grupos para mover parejas."
                : "Todas las parejas ya tienen resultado. No se pueden mover."}
            </p>
          ) : null}
          {error ? <p className="te-error te-move-pairs__error">{error}</p> : null}
          <div className="te-move-pairs__actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={blocked}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : "Guardar grupos"}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
