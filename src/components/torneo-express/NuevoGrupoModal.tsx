import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createPair,
  dedupeLegacyPlayersById,
  deletePair,
  getPlayers,
  updatePair,
  type Player,
} from "../../lib/database";
import {
  createVirtualPair,
  updateVirtualPairLabel,
} from "../../lib/createVirtualPair";
import { dedupePlayersById } from "../../lib/rivieraJugadores/playerNameKey";
import { invalidatePlayersPool } from "../../lib/rivieraJugadores/playersPoolCache";
import {
  nextGrupoNombre,
  nextGrupoOrden,
  validateNuevoGrupo,
} from "../../lib/torneoExpress/nuevoGrupo";
import {
  gruposBloqueados,
  textoBloqueoGrupo,
} from "../../lib/torneoExpress/gruposBloqueados";
import { planReasignacion } from "../../lib/torneoExpress/reasignacionGrupos";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";
import {
  draftPairDisplay,
  isVirtualDraftPair,
  nextVirtualPairLabel,
  type DraftTournamentPair,
} from "../../lib/torneoExpress/virtualPairDraft";
import {
  crearGrupoConParejas,
  crearGrupoNuevo,
  descartarGrupo,
  resolverRegistroParejas,
} from "../../services/torneoExpressNuevoGrupo";
import { reasignarParejasGrupos } from "../../services/torneoExpressReasignarGrupos";
import { formatSupabaseError } from "../../services/torneoExpressService";
import { Button } from "../ui";
import { ArmarParejasPicker } from "./ArmarParejasPicker";

export interface NuevoGrupoModalProps {
  open: boolean;
  torneoId: string;
  /** `torneo_express.source_tournament_id`: donde viven las parejas de la categoría. */
  sourceTournamentId: string | null;
  userId: string;
  grupos: TorneoExpressGrupo[];
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>;
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>;
  occupiedPlayerIds: ReadonlySet<string>;
  onClose: () => void;
  onCreated: (message: string) => void | Promise<void>;
}

type ExistingPair = {
  id: string;
  label: string;
  grupoId: string;
  grupoNombre: string;
};

export const NuevoGrupoModal: React.FC<NuevoGrupoModalProps> = ({
  open,
  torneoId,
  sourceTournamentId,
  userId,
  grupos,
  parejasPorGrupo,
  partidosPorGrupo,
  occupiedPlayerIds,
  onClose,
  onCreated,
}) => {
  const orderedGroups = useMemo(
    () => [...grupos].sort((a, b) => a.orden - b.orden),
    [grupos]
  );
  const existingNames = useMemo(
    () => orderedGroups.map((g) => g.nombre),
    [orderedGroups]
  );

  const [nombre, setNombre] = useState(() => nextGrupoNombre(existingNames));
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<DraftTournamentPair[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [addingPair, setAddingPair] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const draftsRef = useRef<DraftTournamentPair[]>([]);
  draftsRef.current = drafts;

  const [registroId, setRegistroId] = useState<string | null>(sourceTournamentId);

  useEffect(() => {
    if (!open || registroId) return;
    let cancelled = false;
    const parejaIds = Object.values(parejasPorGrupo)
      .flat()
      .map((p) => p.pareja_id);
    void resolverRegistroParejas({ sourceTournamentId, parejaIds })
      .then((id) => {
        if (!cancelled) setRegistroId(id);
      })
      .catch(() => {
        // Se avisa al intentar formar una pareja.
      });
    return () => {
      cancelled = true;
    };
  }, [open, registroId, sourceTournamentId, parejasPorGrupo]);

  const ensureRegistro = async (): Promise<string | null> => {
    if (registroId) return registroId;
    try {
      const id = await resolverRegistroParejas({
        sourceTournamentId,
        parejaIds: Object.values(parejasPorGrupo)
          .flat()
          .map((p) => p.pareja_id),
      });
      if (id) setRegistroId(id);
      return id;
    } catch {
      return null;
    }
  };

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      invalidatePlayersPool(userId);
      const rows = await getPlayers(userId);
      setPlayers(dedupeLegacyPlayersById(dedupePlayersById(rows ?? [])));
    } catch {
      setError("No se pudo cargar el registro de jugadores.");
    } finally {
      setLoadingPlayers(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    void loadPlayers();
  }, [open, loadPlayers]);

  const pool = useMemo(
    () => players.filter((p) => p.id && !occupiedPlayerIds.has(p.id)),
    [players, occupiedPlayerIds]
  );

  const bloqueados = useMemo(
    () => gruposBloqueados(orderedGroups, parejasPorGrupo, partidosPorGrupo),
    [orderedGroups, parejasPorGrupo, partidosPorGrupo]
  );

  const existingPairs = useMemo<ExistingPair[]>(
    () =>
      orderedGroups
        .filter((grupo) => !bloqueados.has(grupo.id))
        .flatMap((grupo) =>
          (parejasPorGrupo[grupo.id] ?? [])
            .filter((pareja) => pareja.activa !== false)
            .map((pareja) => ({
              id: pareja.pareja_id,
              label: pareja.pareja_display?.trim() || "Pareja",
              grupoId: grupo.id,
              grupoNombre: grupo.nombre,
            }))
        ),
    [orderedGroups, parejasPorGrupo, bloqueados]
  );

  const lockedGroups = useMemo(
    () => orderedGroups.filter((grupo) => bloqueados.has(grupo.id)),
    [orderedGroups, bloqueados]
  );

  const virtualLabels = useMemo(
    () => [
      ...Object.values(parejasPorGrupo)
        .flat()
        .map((p) => p.virtual_label?.trim() ?? "")
        .filter(Boolean),
      ...drafts.filter(isVirtualDraftPair).map((d) => d.virtualLabel),
    ],
    [parejasPorGrupo, drafts]
  );

  const totalParejas = moved.size + drafts.length;

  const discardDrafts = useCallback(async () => {
    const pending = draftsRef.current;
    for (const draft of pending) {
      try {
        await deletePair(draft.id);
      } catch {
        // Pareja huérfana sin grupo: no afecta la categoría.
      }
    }
  }, []);

  const handleClose = async () => {
    if (savingRef.current) return;
    await discardDrafts();
    onClose();
  };

  const formarPareja = async (j1: Player, j2: Player) => {
    if (!j1.id || !j2.id || j1.id === j2.id) {
      setError("Elige dos jugadores distintos.");
      return;
    }
    setAddingPair(true);
    setError("");
    try {
      const registro = await ensureRegistro();
      if (!registro) {
        setError("No se encontró el registro de parejas de esta categoría.");
        return;
      }
      const pair = await createPair(registro, j1.id, j2.id, userId);
      await updatePair(pair.id, {
        player1_name: j1.name.trim(),
        player2_name: j2.name.trim(),
      });
      setDrafts((prev) => [
        ...prev,
        {
          kind: "real",
          id: pair.id,
          jugador1: { ...j1, name: j1.name.trim() },
          jugador2: { ...j2, name: j2.name.trim() },
        },
      ]);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setAddingPair(false);
    }
  };

  const agregarVirtual = async () => {
    if (addingPair) return;
    setAddingPair(true);
    setError("");
    try {
      const registro = await ensureRegistro();
      if (!registro) {
        setError("No se encontró el registro de parejas de esta categoría.");
        return;
      }
      const created = await createVirtualPair({
        tournamentId: registro,
        virtualLabel: nextVirtualPairLabel(virtualLabels),
      });
      setDrafts((prev) => [
        ...prev,
        {
          kind: "virtual",
          id: created.id,
          virtualLabel: created.virtual_label,
        },
      ]);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setAddingPair(false);
    }
  };

  const renombrarVirtual = async (pairId: string, label: string) => {
    setError("");
    try {
      await updateVirtualPairLabel(pairId, label);
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === pairId && isVirtualDraftPair(d)
            ? { ...d, virtualLabel: label.trim() }
            : d
        )
      );
    } catch (e) {
      setError(formatSupabaseError(e));
    }
  };

  const eliminarDraft = async (pareja: DraftTournamentPair) => {
    setError("");
    try {
      await deletePair(pareja.id);
      setDrafts((prev) => prev.filter((d) => d.id !== pareja.id));
    } catch (e) {
      setError(formatSupabaseError(e));
    }
  };

  const toggleMoved = (id: string) => {
    setMoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError("");
  };

  const save = async () => {
    if (savingRef.current) return;
    const validation = validateNuevoGrupo({
      nombre,
      existingNames,
      parejaCount: totalParejas,
    });
    if (validation) {
      setError(validation);
      return;
    }

    const orden = nextGrupoOrden(orderedGroups.map((g) => g.orden));
    const newPairIds = drafts.map((d) => d.id);
    const movedIds = Array.from(moved);

    savingRef.current = true;
    setSaving(true);
    setError("");

    let tempGrupoId: string | null = null;
    try {
      if (movedIds.length === 0) {
        // Sin mover parejas: los grupos actuales no se tocan (sirve con resultados).
        await crearGrupoNuevo({
          torneoId,
          nombre: nombre.trim(),
          orden,
          parejaIds: newPairIds,
        });
        draftsRef.current = [];
        await onCreated(
          `${nombre.trim()} creado. Programa sus partidos desde Editar programación.`
        );
        onClose();
        return;
      }

      // Con parejas movidas solo se reacomodan los grupos sin resultados.
      tempGrupoId = await crearGrupoConParejas({
        torneoId,
        nombre: nombre.trim(),
        orden,
        parejaIds: newPairIds,
      });

      const desired = new Map<string, string[]>();
      const currentByGroup = new Map<string, string[]>();
      for (const grupo of orderedGroups) {
        if (bloqueados.has(grupo.id)) continue;
        const ids = (parejasPorGrupo[grupo.id] ?? [])
          .filter((p) => p.activa !== false)
          .map((p) => p.pareja_id);
        currentByGroup.set(grupo.id, ids);
        desired.set(
          grupo.id,
          ids.filter((id) => !moved.has(id))
        );
      }
      desired.set(tempGrupoId, [...movedIds, ...newPairIds]);
      currentByGroup.set(tempGrupoId, newPairIds);

      const planned = planReasignacion({
        grupos: [
          ...orderedGroups,
          { id: tempGrupoId, nombre: nombre.trim(), orden },
        ],
        desired,
        current: currentByGroup,
        partidosPorGrupo: { ...partidosPorGrupo, [tempGrupoId]: [] },
      });
      if (!planned.ok) throw new Error(planned.error);
      if (planned.plan) {
        await reasignarParejasGrupos({ torneoId, ...planned.plan });
      }
      tempGrupoId = null;
      draftsRef.current = [];
      await onCreated(
        `${nombre.trim()} creado. Los partidos pendientes se reprogramaron.`
      );
      onClose();
    } catch (e) {
      if (tempGrupoId) await descartarGrupo(tempGrupoId);
      savingRef.current = false;
      setSaving(false);
      setError(
        e instanceof Error && e.message.trim()
          ? e.message
          : "No se pudo crear el grupo."
      );
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="te-define-pair-backdrop"
      role="presentation"
      onClick={saving ? undefined : () => void handleClose()}
    >
      <div
        className="te-define-pair-dialog te-move-pairs-dialog te-new-group-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="te-new-group-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="te-define-pair-dialog__head">
          <div className="te-new-group__titles">
            <h2 id="te-new-group-title">Nuevo grupo</h2>
            <p>Disponible aunque la fase de grupos ya haya empezado.</p>
          </div>
          <button
            type="button"
            className="te-define-pair-dialog__close"
            onClick={() => void handleClose()}
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="te-define-pair-dialog__body">
          <label className="te-new-group__field">
            <span>Nombre del grupo</span>
            <input
              type="text"
              value={nombre}
              maxLength={80}
              disabled={saving}
              onChange={(e) => {
                setNombre(e.target.value);
                setError("");
              }}
            />
          </label>

          <section className="te-new-group__section">
            <header className="te-new-group__section-head">
              <span className="te-new-group__step" aria-hidden>
                1
              </span>
              <div>
                <h3>Parejas nuevas</h3>
                <p>Forma parejas con jugadores que aún no están en el torneo.</p>
              </div>
            </header>
            {loadingPlayers ? (
              <p className="te-new-group__empty">Cargando jugadores…</p>
            ) : (
              <ArmarParejasPicker
                jugadoresPool={pool}
                parejas={drafts}
                addingPair={addingPair || saving}
                onFormarPareja={(j1, j2) => void formarPareja(j1, j2)}
                onAgregarParejaVirtual={() => void agregarVirtual()}
                onRenombrarParejaVirtual={(id, label) =>
                  void renombrarVirtual(id, label)
                }
                onEliminarPareja={(p) => void eliminarDraft(p)}
                onRefreshRegistro={() => void loadPlayers()}
              />
            )}
          </section>

          <section className="te-new-group__section">
            <header className="te-new-group__section-head">
              <span className="te-new-group__step" aria-hidden>
                2
              </span>
              <div>
                <h3>
                  Mover parejas de otros grupos
                  <span className="te-new-group__optional">Opcional</span>
                </h3>
                <p>Solo grupos que todavía no tienen resultados.</p>
              </div>
            </header>
            {existingPairs.length === 0 ? (
              <p className="te-new-group__empty">
                No hay parejas que se puedan mover: todos los grupos ya iniciaron.
              </p>
            ) : (
              <div className="te-new-group__existing">
                {orderedGroups
                  .filter((grupo) =>
                    existingPairs.some((pair) => pair.grupoId === grupo.id)
                  )
                  .map((grupo) => (
                    <div key={grupo.id} className="te-new-group__existing-group">
                      <h4>{grupo.nombre}</h4>
                      <div className="te-new-group__chips">
                        {existingPairs
                          .filter((pair) => pair.grupoId === grupo.id)
                          .map((pair) => (
                            <label
                              key={pair.id}
                              className={`te-new-group__chip${
                                moved.has(pair.id)
                                  ? " te-new-group__chip--on"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={moved.has(pair.id)}
                                disabled={saving}
                                onChange={() => toggleMoved(pair.id)}
                              />
                              <span>{pair.label}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {lockedGroups.map((grupo) => (
              <p key={grupo.id} className="te-new-group__locked">
                <strong>{grupo.nombre}</strong>{" "}
                {textoBloqueoGrupo(bloqueados.get(grupo.id)!)}
              </p>
            ))}
          </section>

          {totalParejas > 0 ? (
            <p className="te-new-group__summary">
              <strong>
                {totalParejas} {totalParejas === 1 ? "pareja" : "parejas"}
              </strong>{" "}
              en {nombre.trim() || "el grupo nuevo"}
              {drafts.length > 0
                ? ` · ${drafts.map(draftPairDisplay).join(" · ")}`
                : ""}
            </p>
          ) : null}
        </div>

        <footer className="te-define-pair-dialog__foot">
          <p className="te-new-group__hint">
            {moved.size > 0
              ? "Al mover parejas, solo se rearman los grupos sin resultados; los que ya iniciaron no se tocan."
              : "Los partidos del grupo nuevo se crean sin horario. Prográmalos con Editar programación → Programar faltantes."}
          </p>
          {error ? <p className="te-error te-move-pairs__error">{error}</p> : null}
          <div className="te-move-pairs__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleClose()}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={saving || addingPair || totalParejas < 2}
              onClick={() => void save()}
            >
              {saving ? "Creando…" : "Crear grupo"}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
