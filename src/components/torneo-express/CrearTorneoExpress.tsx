import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPair,
  createTournament,
  dedupeLegacyPlayersById,
  deletePair,
  getPlayers,
  getTournamentById,
  updatePair,
  type Player,
} from "../../lib/database";
import { useUser } from "../../contexts/UserContext";
import type { GrupoAssignmentDraft } from "../../lib/torneoExpress/types";
import {
  createTorneoExpressWithGroups,
  fetchPairsForTournament,
  formatSupabaseError,
  linkTorneoToEvento,
  pruneDraftPairsForTournament,
} from "../../services/torneoExpressService";
import { navigateTorneoExpress } from "./torneoExpressNav";
import { ArmarParejasPicker } from "./ArmarParejasPicker";
import { AsignarParejasGrupos } from "./AsignarParejasGrupos";
import {
  ParejaDraft,
  TE_DRAFT_TOURNAMENT_KEY,
  TE_EXPRESS_DRAFT_TOURNAMENT_NAME,
} from "./crearTorneoExpressTypes";
import { persistTournamentGameMode } from "../../lib/gameModeMapping";
import {
  dedupeParejaDraftsByPlayerId,
  dedupePlayersById,
  resolvePlayerInPool,
  splitParejaDraftsByPlayerId,
  unorderedPairIdKey,
} from "../../lib/rivieraJugadores/playerNameKey";
import { playerNeedsEmailContact } from "../../services/torneoExpressNotificacionesService";
import {
  clampNumGrupos,
  parseNumGruposInput,
  resolveNumGrupos,
  type NumGruposDraft,
} from "../../lib/torneoExpress/numGruposInput";
import { TE_CREATE_NOTIFS_ENABLED } from "../../lib/torneoExpress/teCreateNotifs";
import { Button } from "../ui";

type PlayerWithContact = Player & {
  email_verified?: boolean | null;
};

const WIZARD_STEPS = [
  { id: "datos", label: "Datos", num: 1 },
  { id: "parejas", label: "Parejas", num: 2 },
  { id: "grupos", label: "Grupos", num: 3 },
  { id: "crear", label: "Crear", num: 4 },
] as const;

type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

interface CrearTorneoExpressProps {
  /** Si viene, el torneo creado se vincula a este Evento (categoría). */
  eventoId?: string;
  /** Callback tras crear (y vincular si hay eventoId). */
  onTorneoCreated?: (torneoId: string) => void;
  /**
   * Si true y hay eventoId, tras crear vuelve al detalle del evento
   * en lugar de ir a gestionar. Default: true cuando hay eventoId.
   */
  returnToEventoAfterCreate?: boolean;
}

export const CrearTorneoExpress: React.FC<CrearTorneoExpressProps> = ({
  eventoId,
  onTorneoCreated,
  returnToEventoAfterCreate,
}) => {
  const { user } = useUser();
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [numGrupos, setNumGrupos] = useState<NumGruposDraft>(2);
  const [draftTournamentId, setDraftTournamentId] = useState<string | null>(null);
  const [jugadores, setJugadores] = useState<Player[]>([]);
  const [parejas, setParejas] = useState<ParejaDraft[]>([]);
  const [assignments, setAssignments] = useState<GrupoAssignmentDraft[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [addingPair, setAddingPair] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStepId>("datos");
  const [loadingJugadores, setLoadingJugadores] = useState(false);

  const jugadoresEnParejasSinEmail = useMemo(() => {
    const ids = new Set<string>();
    parejas.forEach((p) => {
      ids.add(p.jugador1.id);
      ids.add(p.jugador2.id);
    });
    return jugadores.filter(
      (j) =>
        ids.has(j.id) && playerNeedsEmailContact(j as PlayerWithContact)
    );
  }, [parejas, jugadores]);

  const jugadoresPool = useMemo(
    () => dedupeLegacyPlayersById(dedupePlayersById(jugadores)),
    [jugadores]
  );

  const syncParejasFromPlayers = useCallback((list: Player[]) => {
    setParejas((prev) =>
      prev.map((p) => ({
        ...p,
        jugador1: resolvePlayerInPool(p.jugador1, list),
        jugador2: resolvePlayerInPool(p.jugador2, list),
      }))
    );
  }, []);

  const handleJugadoresChange = useCallback(
    (list: Player[]) => {
      const deduped = dedupeLegacyPlayersById(dedupePlayersById(list));
      setJugadores(deduped);
      syncParejasFromPlayers(deduped);
    },
    [syncParejasFromPlayers]
  );

  const cargarJugadores = useCallback(async () => {
    if (!user?.id) return;
    setLoadingJugadores(true);
    try {
      const data = await getPlayers(user.id);
      handleJugadoresChange(data ?? []);
    } catch {
      setError("No se pudieron cargar los jugadores del registro");
    } finally {
      setLoadingJugadores(false);
    }
  }, [user?.id, handleJugadoresChange]);

  useEffect(() => {
    if (!user?.id || initializing) return;
    void cargarJugadores();
  }, [user?.id, initializing, cargarJugadores]);

  const loadPairsForDraft = useCallback(
    async (tournamentId: string, players: Player[]) => {
      const rows = await fetchPairsForTournament(tournamentId);
      const byId = new Map(players.map((p) => [p.id, p]));
      const drafts: ParejaDraft[] = [];
      for (const row of rows ?? []) {
        const raw1 =
          byId.get(row.player1_id) ??
          ({
            id: row.player1_id,
            name: row.player1_name,
            email: "",
            created_at: row.created_at,
          } as Player);
        const raw2 =
          byId.get(row.player2_id) ??
          ({
            id: row.player2_id,
            name: row.player2_name,
            email: "",
            created_at: row.created_at,
          } as Player);
        const j1 = resolvePlayerInPool(raw1, players);
        const j2 = resolvePlayerInPool(raw2, players);
        drafts.push({
          id: row.id,
          jugador1: j1,
          jugador2: j2,
        });

        if (
          j1.id !== row.player1_id ||
          j2.id !== row.player2_id ||
          j1.name !== row.player1_name ||
          j2.name !== row.player2_name
        ) {
          try {
            await updatePair(row.id, {
              player1_id: j1.id,
              player2_id: j2.id,
              player1_name: j1.name,
              player2_name: j2.name,
            });
          } catch {
            /* la UI sigue con ids canónicos en memoria */
          }
        }
      }
      const preferIds = drafts.map((d) => d.id);
      const { kept, droppedIds } = splitParejaDraftsByPlayerId(
        drafts,
        preferIds
      );
      for (const id of droppedIds) {
        try {
          await deletePair(id);
        } catch {
          /* fila ya eliminada */
        }
      }
      setParejas(kept);
    },
    []
  );

  useEffect(() => {
    if (!user?.id) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const stored = sessionStorage.getItem(TE_DRAFT_TOURNAMENT_KEY);
        let tournamentId = stored;

        if (tournamentId) {
          const existing = await getTournamentById(tournamentId);
          if (!existing || existing.user_id !== user.id) {
            tournamentId = null;
          }
        }

        if (!tournamentId) {
          const created = await createTournament(
            TE_EXPRESS_DRAFT_TOURNAMENT_NAME,
            user.id,
            "Parejas en armado para torneo",
            1
          );
          tournamentId = created.id;
          persistTournamentGameMode(created.id, "mini-torneo");
          sessionStorage.setItem(TE_DRAFT_TOURNAMENT_KEY, created.id);
        }

        if (cancelled || !tournamentId) return;
        setDraftTournamentId(tournamentId);
      } catch (err) {
        if (!cancelled) {
          setError(formatSupabaseError(err));
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const jugadoresForPairsRef = useRef(jugadores);
  jugadoresForPairsRef.current = jugadores;

  useEffect(() => {
    if (!draftTournamentId || jugadores.length === 0) return;
    loadPairsForDraft(draftTournamentId, jugadoresForPairsRef.current).catch(() => {
      /* ignore */
    });
  }, [draftTournamentId, jugadores.length, loadPairsForDraft]);

  useEffect(() => {
    const n = resolveNumGrupos(numGrupos);
    setAssignments((prev) => {
      const next: GrupoAssignmentDraft[] = [];
      for (let i = 0; i < n; i++) {
        const existing = prev[i];
        next.push({
          nombre: existing?.nombre ?? `Grupo ${i + 1}`,
          orden: i,
          parejaIds: existing?.parejaIds ?? [],
        });
      }
      return next;
    });
  }, [numGrupos]);

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    assignments.forEach((g) => g.parejaIds.forEach((id) => s.add(id)));
    return s;
  }, [assignments]);

  const formarPareja = async (j1: Player, j2: Player) => {
    if (!user?.id || !draftTournamentId) return;

    if (!j1.id || !j2.id || j1.id === j2.id) {
      setError("Elige dos jugadores distintos");
      return;
    }

    const pairKey = unorderedPairIdKey(j1.id, j2.id);
    const yaEnPareja = parejas.some((p) => {
      const ids = [p.jugador1.id, p.jugador2.id];
      return (
        ids.includes(j1.id) ||
        ids.includes(j2.id) ||
        unorderedPairIdKey(p.jugador1.id, p.jugador2.id) === pairKey
      );
    });
    if (yaEnPareja) {
      setError("Uno de los jugadores ya está en otra pareja");
      return;
    }

    setAddingPair(true);
    setError(null);
    try {
      const pair = await createPair(
        draftTournamentId,
        j1.id,
        j2.id,
        user.id
      );
      await updatePair(pair.id, {
        player1_name: j1.name.trim(),
        player2_name: j2.name.trim(),
      });
      setParejas((prev) =>
        dedupeParejaDraftsByPlayerId([
          ...prev,
          {
            id: pair.id,
            jugador1: { ...j1, name: j1.name.trim() },
            jugador2: { ...j2, name: j2.name.trim() },
          },
        ])
      );
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setAddingPair(false);
    }
  };

  const eliminarPareja = async (pareja: ParejaDraft) => {
    setError(null);
    try {
      await deletePair(pareja.id);
      setParejas((prev) => prev.filter((p) => p.id !== pareja.id));
      setAssignments((prev) =>
        prev.map((g) => ({
          ...g,
          parejaIds: g.parejaIds.filter((id) => id !== pareja.id),
        }))
      );
    } catch (err) {
      setError(formatSupabaseError(err));
    }
  };

  const togglePair = useCallback((grupoIndex: number, pairId: string) => {
    setAssignments((prev) =>
      prev.map((g, idx) => {
        if (idx !== grupoIndex) {
          if (g.parejaIds.includes(pairId)) {
            return { ...g, parejaIds: g.parejaIds.filter((id) => id !== pairId) };
          }
          return g;
        }
        const has = g.parejaIds.includes(pairId);
        return {
          ...g,
          parejaIds: has
            ? g.parejaIds.filter((id) => id !== pairId)
            : [...g.parejaIds, pairId],
        };
      })
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Debes iniciar sesión");
      return;
    }
    if (!nombre.trim()) {
      setError("Nombre del torneo requerido");
      return;
    }
    if (!draftTournamentId) {
      setError("Preparando borrador… intenta de nuevo en un momento");
      return;
    }
    if (parejas.length < 2) {
      setError("Arma al menos 2 parejas antes de crear el torneo");
      return;
    }
    for (const g of assignments) {
      if (g.parejaIds.length < 2) {
        setError(`"${g.nombre}" necesita al menos 2 parejas`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const keepIds = parejas.map((p) => p.id);
      await pruneDraftPairsForTournament(draftTournamentId, keepIds);

      const torneoId = await createTorneoExpressWithGroups({
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        sourceTournamentId: draftTournamentId,
        grupos: assignments,
        keepPairIds: keepIds,
      });
      sessionStorage.removeItem(TE_DRAFT_TOURNAMENT_KEY);

      const linkedEventoId = eventoId?.trim() || null;
      if (linkedEventoId) {
        await linkTorneoToEvento(torneoId, linkedEventoId);
      }

      onTorneoCreated?.(torneoId);

      const goBackToEvento =
        Boolean(linkedEventoId) &&
        (returnToEventoAfterCreate ?? true);
      if (goBackToEvento && linkedEventoId) {
        navigateTorneoExpress(`/torneo-express/evento/${linkedEventoId}`);
      } else {
        navigateTorneoExpress(`/torneo-express/${torneoId}/gestionar`);
      }
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === wizardStep);

  const gruposIncomplete = useMemo(() => {
    if (parejas.length < 2) return true;
    return assignments.some((g) => g.parejaIds.length < 2);
  }, [parejas.length, assignments]);

  const goNext = () => {
    setError(null);
    if (wizardStep === "datos") {
      if (!nombre.trim()) {
        setError("Escribe el nombre del torneo");
        return;
      }
      setNumGrupos((prev) => (prev === "" ? 2 : clampNumGrupos(prev)));
      setWizardStep("parejas");
      return;
    }
    if (wizardStep === "parejas") {
      if (parejas.length < 2) {
        setError("Arma al menos 2 parejas para continuar");
        return;
      }
      setWizardStep("grupos");
      return;
    }
    if (wizardStep === "grupos") {
      if (gruposIncomplete) {
        setError("Cada grupo necesita al menos 2 parejas");
        return;
      }
      setWizardStep("crear");
    }
  };

  const goBack = () => {
    setError(null);
    if (wizardStep === "parejas") setWizardStep("datos");
    else if (wizardStep === "grupos") setWizardStep("parejas");
    else if (wizardStep === "crear") setWizardStep("grupos");
  };

  const jumpToStep = (id: WizardStepId) => {
    const target = WIZARD_STEPS.findIndex((s) => s.id === id);
    if (target < 0 || target > stepIndex) return;
    setError(null);
    setWizardStep(id);
  };

  return (
    <form
      className="te-crear-layout te-crear-form te-crear-layout--wizard"
      onSubmit={handleSubmit}
    >
      <div className="te-crear-layout__main">
        <div className="te-crear-layout__panel">
          {error ? <p className="te-error">{error}</p> : null}

          {initializing ? (
            <p className="te-subtitle">Preparando borrador…</p>
          ) : (
            <>
              <nav className="te-crear-wizard-nav" aria-label="Progreso">
                <ol className="te-crear-wizard-nav__list">
                  {WIZARD_STEPS.map((step, i) => {
                    const state =
                      i < stepIndex
                        ? "done"
                        : i === stepIndex
                          ? "current"
                          : "todo";
                    return (
                      <li
                        key={step.id}
                        className={`te-crear-wizard-nav__item te-crear-wizard-nav__item--${state}`}
                      >
                        <button
                          type="button"
                          className="te-crear-wizard-nav__btn"
                          disabled={i > stepIndex}
                          onClick={() => jumpToStep(step.id)}
                          aria-current={state === "current" ? "step" : undefined}
                        >
                          <span className="te-crear-wizard-nav__num" aria-hidden>
                            {step.num}
                          </span>
                          <span className="te-crear-wizard-nav__label">
                            {step.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              {wizardStep === "datos" ? (
                <section
                  className="te-crear-step"
                  aria-labelledby="te-step-datos-heading"
                >
                  <header className="te-crear-step__head">
                    <span className="te-crear-step__badge">Paso 1 de 4</span>
                    <h3
                      id="te-step-datos-heading"
                      className="te-crear-step__title"
                    >
                      Datos del torneo
                    </h3>
                  </header>
                  <p className="te-crear-step__lead">
                    Nombre, categoría y cuántos grupos.
                  </p>
                  <div className="te-crear-step__body">
                    <div className="te-crear-form__fields">
                      <div className="torneo-express-field">
                        <label htmlFor="te-nombre">Nombre</label>
                        <input
                          id="te-nombre"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          placeholder="Ej. Riviera Open Mayo"
                        />
                      </div>

                      <div className="torneo-express-field">
                        <label htmlFor="te-categoria">Categoría</label>
                        <input
                          id="te-categoria"
                          value={categoria}
                          onChange={(e) => setCategoria(e.target.value)}
                          placeholder="Ej. 4ta, 5ta, Open"
                          autoComplete="off"
                        />
                      </div>

                      <div className="torneo-express-field">
                        <label htmlFor="te-grupos">Grupos</label>
                        <input
                          id="te-grupos"
                          type="number"
                          inputMode="numeric"
                          min={2}
                          max={8}
                          value={numGrupos}
                          onChange={(e) => {
                            const next = parseNumGruposInput(e.target.value);
                            if (next !== null) setNumGrupos(next);
                          }}
                          onBlur={() => {
                            setNumGrupos((prev) =>
                              prev === "" ? 2 : clampNumGrupos(prev)
                            );
                          }}
                        />
                      </div>
                    </div>

                    {TE_CREATE_NOTIFS_ENABLED ? (
                      <div className="te-crear-form__notices">
                        <div className="te-crear-notif-hint" role="note">
                          <strong>Notificaciones automáticas</strong>
                          <p>
                            Al crear el torneo, cada jugador con email real
                            recibe aviso de inscripción y grupo.
                          </p>
                        </div>
                        {jugadoresEnParejasSinEmail.length > 0 ? (
                          <p className="te-crear-notif-warn" role="alert">
                            {jugadoresEnParejasSinEmail.length} jugador(es) sin
                            email:{" "}
                            {jugadoresEnParejasSinEmail
                              .map((j) => j.name)
                              .join(", ")}
                            .
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {wizardStep === "parejas" ? (
                <section
                  className="te-crear-step"
                  aria-labelledby="te-step-parejas-heading"
                >
                  <header className="te-crear-step__head">
                    <span className="te-crear-step__badge">Paso 2 de 4</span>
                    <h3
                      id="te-step-parejas-heading"
                      className="te-crear-step__title"
                    >
                      Armar parejas
                    </h3>
                  </header>
                  <p className="te-crear-step__lead">
                    Toca dos jugadores: la pareja se forma sola. Si te
                    equivocas, bórrala abajo.
                  </p>
                  <div className="te-crear-step__body">
                    {loadingJugadores ? (
                      <p className="te-subtitle">Cargando jugadores…</p>
                    ) : (
                      <ArmarParejasPicker
                        jugadoresPool={jugadoresPool}
                        parejas={parejas}
                        addingPair={addingPair}
                        onFormarPareja={(j1, j2) => void formarPareja(j1, j2)}
                        onEliminarPareja={(p) => void eliminarPareja(p)}
                        onRefreshRegistro={() => void cargarJugadores()}
                      />
                    )}
                  </div>
                </section>
              ) : null}

              {wizardStep === "grupos" ? (
                <section
                  className="te-crear-step"
                  aria-labelledby="te-step-grupos-heading"
                >
                  <header className="te-crear-step__head">
                    <span className="te-crear-step__badge">Paso 3 de 4</span>
                    <h3
                      id="te-step-grupos-heading"
                      className="te-crear-step__title"
                    >
                      Repartir en grupos
                    </h3>
                  </header>
                  <p className="te-crear-step__lead">
                    Asigna cada pareja a un grupo. Mínimo 2 parejas por grupo.
                  </p>
                  <div className="te-crear-step__body">
                    <AsignarParejasGrupos
                      parejas={parejas}
                      assignments={assignments}
                      assignedIds={assignedIds}
                      onAssignmentsChange={setAssignments}
                      onTogglePair={togglePair}
                    />
                  </div>
                </section>
              ) : null}

              {wizardStep === "crear" ? (
                <section
                  className="te-crear-step"
                  aria-labelledby="te-step-crear-heading"
                >
                  <header className="te-crear-step__head">
                    <span className="te-crear-step__badge">Paso 4 de 4</span>
                    <h3
                      id="te-step-crear-heading"
                      className="te-crear-step__title"
                    >
                      Confirmar y crear
                    </h3>
                  </header>
                  <p className="te-crear-step__lead">
                    Revisa el resumen y crea el torneo con sus partidos.
                  </p>
                  <div className="te-crear-step__body">
                    <ul className="te-crear-summary">
                      <li>
                        <span>Nombre</span>
                        <strong>{nombre.trim() || "—"}</strong>
                      </li>
                      <li>
                        <span>Categoría</span>
                        <strong>{categoria.trim() || "—"}</strong>
                      </li>
                      <li>
                        <span>Grupos</span>
                        <strong>{resolveNumGrupos(numGrupos)}</strong>
                      </li>
                      <li>
                        <span>Parejas</span>
                        <strong>{parejas.length}</strong>
                      </li>
                    </ul>
                  </div>
                </section>
              ) : null}

              <div className="te-crear-wizard-actions">
                {wizardStep !== "datos" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goBack}
                    disabled={submitting}
                  >
                    ← Atrás
                  </Button>
                ) : (
                  <span />
                )}

                {wizardStep !== "crear" ? (
                  <Button type="button" variant="primary" onClick={goNext}>
                    Siguiente →
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    className="te-crear-submit"
                    disabled={submitting || parejas.length < 2}
                    loading={submitting}
                  >
                    {submitting
                      ? "Creando…"
                      : "Crear torneo y generar partidos"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </form>
  );
};

