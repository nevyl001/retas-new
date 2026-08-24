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
  TE_EXPRESS_DRAFT_TOURNAMENT_NAME,
  clearTeWizardDraft,
  loadTeWizardDraft,
  normalizeTeWizardScheduleDraft,
  resolveActiveCourtNames,
  saveTeWizardDraft,
  teDraftTournamentStorageKey,
  type TeWizardScheduleDraft,
  type TeWizardStepId,
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
import {
  assignRoundRobinSchedule,
  buildSchedulePreviewSummary,
  defaultCourtNames,
  validateCourtNames,
} from "../../lib/torneoExpress/assignRoundRobinSchedule";
import { buildDraftScheduleMatches } from "../../lib/torneoExpress/draftScheduleMatch";
import { validateScheduleInvariants } from "../../lib/torneoExpress/scheduleInvariants";
import { formatPairDisplay } from "../../lib/torneoExpress/standings";

type PlayerWithContact = Player & {
  email_verified?: boolean | null;
};

const WIZARD_STEPS = [
  { id: "datos", label: "Datos", num: 1 },
  { id: "parejas", label: "Parejas", num: 2 },
  { id: "grupos", label: "Grupos", num: 3 },
  { id: "programacion", label: "Horarios", num: 4 },
  { id: "confirmar", label: "Crear", num: 5 },
] as const;

type WizardStepId = TeWizardStepId;

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

function readInitialWizardDraft(eventoId?: string) {
  return loadTeWizardDraft(eventoId);
}

export const CrearTorneoExpress: React.FC<CrearTorneoExpressProps> = ({
  eventoId,
  onTorneoCreated,
  returnToEventoAfterCreate,
}) => {
  const { user } = useUser();
  const initialDraft = useMemo(
    () => readInitialWizardDraft(eventoId),
    // Solo al montar / cambiar de evento
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventoId]
  );
  const [nombre, setNombre] = useState(initialDraft?.nombre ?? "");
  const [categoria, setCategoria] = useState(initialDraft?.categoria ?? "");
  const [numGrupos, setNumGrupos] = useState<NumGruposDraft>(
    initialDraft?.numGrupos ?? 2
  );
  const [draftTournamentId, setDraftTournamentId] = useState<string | null>(
    initialDraft?.draftTournamentId ?? null
  );
  const [jugadores, setJugadores] = useState<Player[]>([]);
  const [parejas, setParejas] = useState<ParejaDraft[]>([]);
  const [assignments, setAssignments] = useState<GrupoAssignmentDraft[]>(
    initialDraft?.assignments ?? []
  );
  const [initializing, setInitializing] = useState(true);
  const [addingPair, setAddingPair] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStepId>(
    initialDraft?.wizardStep ?? "datos"
  );
  const [schedule, setSchedule] = useState<TeWizardScheduleDraft>(
    normalizeTeWizardScheduleDraft(initialDraft?.schedule)
  );
  const [loadingJugadores, setLoadingJugadores] = useState(false);
  /** Evita crear el torneo con un doble clic al pasar de programación → confirmar. */
  const [confirmArmed, setConfirmArmed] = useState(false);

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
    if (wizardStep !== "confirmar") {
      setConfirmArmed(false);
      return;
    }
    const timer = window.setTimeout(() => setConfirmArmed(true), 450);
    return () => window.clearTimeout(timer);
  }, [wizardStep]);

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
    const draftKey = teDraftTournamentStorageKey(eventoId);

    (async () => {
      try {
        const stored =
          sessionStorage.getItem(draftKey) ||
          initialDraft?.draftTournamentId ||
          null;
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
        }

        if (tournamentId) {
          sessionStorage.setItem(draftKey, tournamentId);
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
  }, [user?.id, eventoId, initialDraft?.draftTournamentId]);

  useEffect(() => {
    if (initializing) return;
    saveTeWizardDraft(eventoId, {
      wizardStep,
      nombre,
      categoria,
      numGrupos,
      assignments,
      draftTournamentId,
      schedule,
    });
  }, [
    initializing,
    eventoId,
    wizardStep,
    nombre,
    categoria,
    numGrupos,
    assignments,
    draftTournamentId,
    schedule,
  ]);

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

  const pairLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parejas) {
      map.set(
        p.id,
        formatPairDisplay(p.jugador1.name, p.jugador2.name)
      );
    }
    return map;
  }, [parejas]);

  const activeCourtNames = useMemo(
    () => resolveActiveCourtNames(schedule),
    [schedule]
  );

  const scheduleCourtError = useMemo(
    () => validateCourtNames(activeCourtNames),
    [activeCourtNames]
  );

  const gruposIncomplete = useMemo(() => {
    if (parejas.length < 2) return true;
    return assignments.some((g) => g.parejaIds.length < 2);
  }, [parejas.length, assignments]);

  const schedulePreview = useMemo(() => {
    if (gruposIncomplete || scheduleCourtError) return null;
    if (!schedule.playDate.trim() || !schedule.startTime.trim()) return null;
    if (!Number.isFinite(schedule.durationMinutes) || schedule.durationMinutes <= 0) {
      return null;
    }
    if (activeCourtNames.length === 0) return null;

    try {
      const draftMatches = buildDraftScheduleMatches(assignments);
      if (draftMatches.length === 0) return null;

      const scheduled = assignRoundRobinSchedule({
        matches: draftMatches,
        courts: activeCourtNames,
        date: schedule.playDate.trim(),
        startTime: schedule.startTime.trim(),
        durationMinutes: Math.floor(schedule.durationMinutes),
      });
      validateScheduleInvariants(draftMatches, scheduled);

      return buildSchedulePreviewSummary(scheduled, {
        courts: activeCourtNames,
        date: schedule.playDate.trim(),
        startTime: schedule.startTime.trim(),
        durationMinutes: Math.floor(schedule.durationMinutes),
      });
    } catch {
      return null;
    }
  }, [
    assignments,
    activeCourtNames,
    gruposIncomplete,
    schedule.playDate,
    schedule.startTime,
    schedule.durationMinutes,
    scheduleCourtError,
  ]);

  const scheduleReady = Boolean(schedulePreview) && !scheduleCourtError;

  const handleCourtCountChange = (raw: string) => {
    const parsed = Number(raw);
    const nextCount = Number.isFinite(parsed)
      ? Math.max(1, Math.min(8, Math.floor(parsed)))
      : 1;
    setSchedule((prev) => {
      const names = [...prev.courtNames];
      while (names.length < nextCount) {
        names.push(defaultCourtNames(nextCount)[names.length] ?? `Cancha ${names.length + 1}`);
      }
      return normalizeTeWizardScheduleDraft({
        ...prev,
        courtCount: nextCount,
        courtNames: names,
      });
    });
  };

  const handleCourtNameChange = (index: number, value: string) => {
    setSchedule((prev) => {
      const names = [...prev.courtNames];
      names[index] = value;
      return { ...prev, courtNames: names };
    });
  };

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
    if (wizardStep !== "confirmar") {
      return;
    }
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
    if (scheduleCourtError) {
      setError(scheduleCourtError);
      return;
    }
    if (!schedule.playDate.trim() || !schedule.startTime.trim()) {
      setError("Indica el día y la hora de inicio.");
      return;
    }
    if (!Number.isFinite(schedule.durationMinutes) || schedule.durationMinutes <= 0) {
      setError("La duración por partido debe ser mayor a 0 minutos.");
      return;
    }
    if (activeCourtNames.length === 0) {
      setError("Agrega al menos una cancha.");
      return;
    }
    if (!schedulePreview) {
      setError("No fue posible programar todos los partidos. Revisa la configuración.");
      return;
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
        schedule: {
          playDate: schedule.playDate.trim(),
          startTime: schedule.startTime.trim(),
          durationMinutes: Math.floor(schedule.durationMinutes),
          courtNames: activeCourtNames,
        },
      });
      sessionStorage.removeItem(teDraftTournamentStorageKey(eventoId));
      clearTeWizardDraft(eventoId);

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
      setWizardStep("programacion");
      return;
    }
    if (wizardStep === "programacion") {
      if (!scheduleReady) {
        setError(
          "Revisa la programación: día, hora, duración y canchas deben ser válidos."
        );
        return;
      }
      setWizardStep("confirmar");
    }
  };

  const goBack = () => {
    setError(null);
    if (wizardStep === "parejas") setWizardStep("datos");
    else if (wizardStep === "grupos") setWizardStep("parejas");
    else if (wizardStep === "programacion") setWizardStep("grupos");
    else if (wizardStep === "confirmar") setWizardStep("programacion");
  };

  const jumpToStep = (id: WizardStepId) => {
    const target = WIZARD_STEPS.findIndex((s) => s.id === id);
    if (target < 0 || target > stepIndex) return;
    setError(null);
    setWizardStep(id);
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || wizardStep === "confirmar") return;
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      e.preventDefault();
    }
  };

  return (
    <form
      className="te-crear-layout te-crear-form te-crear-layout--wizard"
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
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
                    <span className="te-crear-step__badge">Paso 1 de 5</span>
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
                    <span className="te-crear-step__badge">Paso 2 de 5</span>
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
                    <span className="te-crear-step__badge">Paso 3 de 5</span>
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

              {wizardStep === "programacion" ? (
                <section
                  className="te-crear-step"
                  aria-labelledby="te-step-programacion-heading"
                >
                  <header className="te-crear-step__head">
                    <span className="te-crear-step__badge">Paso 4 de 5</span>
                    <h3
                      id="te-step-programacion-heading"
                      className="te-crear-step__title"
                    >
                      Programación y canchas
                    </h3>
                  </header>
                  <p className="te-crear-step__lead">
                    Elige el día, la hora de inicio, la duración por partido y
                    las canchas disponibles.
                  </p>
                  <div className="te-crear-step__body">
                    <section
                      className="te-crear-schedule"
                      aria-labelledby="te-crear-schedule-heading"
                    >
                      <h4
                        id="te-crear-schedule-heading"
                        className="te-crear-schedule__title"
                      >
                        Horarios
                      </h4>

                      <div className="te-crear-schedule__fields">
                        <div className="torneo-express-field">
                          <label htmlFor="te-play-date">Día de juego</label>
                          <input
                            id="te-play-date"
                            type="date"
                            value={schedule.playDate}
                            onChange={(e) =>
                              setSchedule((prev) => ({
                                ...prev,
                                playDate: e.target.value,
                              }))
                            }
                            required
                          />
                        </div>
                        <div className="torneo-express-field">
                          <label htmlFor="te-start-time">Hora de inicio</label>
                          <input
                            id="te-start-time"
                            type="time"
                            value={schedule.startTime}
                            onChange={(e) =>
                              setSchedule((prev) => ({
                                ...prev,
                                startTime: e.target.value,
                              }))
                            }
                            required
                          />
                        </div>
                        <div className="torneo-express-field">
                          <label htmlFor="te-duration">
                            Duración por partido
                          </label>
                          <div className="te-crear-schedule__duration">
                            <input
                              id="te-duration"
                              type="number"
                              min={1}
                              step={1}
                              value={schedule.durationMinutes}
                              onChange={(e) => {
                                const parsed = Number(e.target.value);
                                setSchedule((prev) => ({
                                  ...prev,
                                  durationMinutes: Number.isFinite(parsed)
                                    ? parsed
                                    : prev.durationMinutes,
                                }));
                              }}
                              required
                            />
                            <span className="te-crear-schedule__unit">min</span>
                          </div>
                        </div>
                        <div className="torneo-express-field">
                          <label htmlFor="te-court-count">
                            Canchas disponibles
                          </label>
                          <input
                            id="te-court-count"
                            type="number"
                            min={1}
                            max={8}
                            step={1}
                            value={schedule.courtCount}
                            onChange={(e) => handleCourtCountChange(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="te-crear-schedule__courts">
                        {Array.from({ length: schedule.courtCount }, (_, i) => (
                          <div
                            key={`court-${i}`}
                            className="torneo-express-field te-crear-schedule__court-field"
                          >
                            <label htmlFor={`te-court-name-${i}`}>
                              Cancha {i + 1}
                            </label>
                            <input
                              id={`te-court-name-${i}`}
                              type="text"
                              value={schedule.courtNames[i] ?? ""}
                              onChange={(e) =>
                                handleCourtNameChange(i, e.target.value)
                              }
                              placeholder={`Cancha ${i + 1}`}
                              required
                            />
                          </div>
                        ))}
                      </div>

                      {scheduleCourtError ? (
                        <p className="te-crear-schedule__error" role="alert">
                          {scheduleCourtError}
                        </p>
                      ) : null}

                      {schedulePreview ? (
                        <div className="te-crear-schedule__preview">
                          <h5 className="te-crear-schedule__preview-title">
                            Resumen de programación
                          </h5>
                          <ul className="te-crear-schedule__preview-stats">
                            <li>
                              <span>Partidos</span>
                              <strong>{schedulePreview.matchCount}</strong>
                            </li>
                            <li>
                              <span>Canchas</span>
                              <strong>{schedulePreview.courtCount}</strong>
                            </li>
                            <li>
                              <span>Bloques</span>
                              <strong>{schedulePreview.blockCount}</strong>
                            </li>
                            <li>
                              <span>Inicio</span>
                              <strong>{schedulePreview.startTime}</strong>
                            </li>
                            <li>
                              <span>Final estimado</span>
                              <strong>{schedulePreview.endTime}</strong>
                            </li>
                          </ul>

                          <div className="te-crear-schedule__slots">
                            {schedulePreview.slots.map((slot) => (
                              <div
                                key={slot.slotKey}
                                className="te-crear-schedule__slot"
                              >
                                <h6 className="te-crear-schedule__slot-time">
                                  {slot.time}
                                </h6>
                                <ul className="te-crear-schedule__slot-list">
                                  {slot.matches.map((match) => (
                                    <li
                                      key={match.matchKey}
                                      className="te-crear-schedule__slot-item"
                                    >
                                      <span className="te-crear-schedule__slot-court">
                                        {match.cancha}
                                      </span>
                                      <span className="te-crear-schedule__slot-group">
                                        {match.grupoNombre}
                                      </span>
                                      <span className="te-crear-schedule__slot-vs">
                                        {pairLabelById.get(match.parejaLocalId) ??
                                          match.parejaLocalId}{" "}
                                        vs{" "}
                                        {pairLabelById.get(
                                          match.parejaVisitanteId
                                        ) ?? match.parejaVisitanteId}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : !scheduleCourtError ? (
                        <p className="te-crear-schedule__hint">
                          Completa la programación para ver la vista previa.
                        </p>
                      ) : null}
                    </section>
                  </div>
                </section>
              ) : null}

              {wizardStep === "confirmar" ? (
                <section
                  className="te-crear-step"
                  aria-labelledby="te-step-confirmar-heading"
                >
                  <header className="te-crear-step__head">
                    <span className="te-crear-step__badge">Paso 5 de 5</span>
                    <h3
                      id="te-step-confirmar-heading"
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
                      {schedulePreview ? (
                        <>
                          <li>
                            <span>Día de juego</span>
                            <strong>{schedule.playDate}</strong>
                          </li>
                          <li>
                            <span>Hora de inicio</span>
                            <strong>{schedulePreview.startTime}</strong>
                          </li>
                          <li>
                            <span>Partidos</span>
                            <strong>{schedulePreview.matchCount}</strong>
                          </li>
                          <li>
                            <span>Canchas</span>
                            <strong>{schedulePreview.courtCount}</strong>
                          </li>
                        </>
                      ) : null}
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

                {wizardStep !== "confirmar" ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={goNext}
                    disabled={
                      wizardStep === "programacion" && !scheduleReady
                    }
                  >
                    Siguiente →
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    className="te-crear-submit"
                    disabled={
                      submitting ||
                      parejas.length < 2 ||
                      !scheduleReady ||
                      !confirmArmed
                    }
                    loading={submitting}
                  >
                    {submitting
                      ? "Creando…"
                      : "Confirmar y crear torneo"}
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

