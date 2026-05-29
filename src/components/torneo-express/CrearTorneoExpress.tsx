import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPair,
  createTournament,
  deletePair,
  getTournamentById,
  type Player,
} from "../../lib/database";
import { useUser } from "../../contexts/UserContext";
import type { GrupoAssignmentDraft } from "../../lib/torneoExpress/types";
import {
  createTorneoExpressWithGroups,
  fetchPairsForTournament,
  formatSupabaseError,
} from "../../services/torneoExpressService";
import { navigateTorneoExpress } from "./torneoExpressNav";
import { TorneoExpressPlayerPanel } from "./TorneoExpressPlayerPanel";
import {
  ParejaDraft,
  TE_DRAFT_TOURNAMENT_KEY,
  TE_EXPRESS_DRAFT_TOURNAMENT_NAME,
} from "./crearTorneoExpressTypes";
import { persistTournamentGameMode } from "../../lib/gameModeMapping";
import { Button } from "../ui";

interface CrearTorneoExpressProps {
  onTorneoCreated?: () => void;
}

export const CrearTorneoExpress: React.FC<CrearTorneoExpressProps> = ({
  onTorneoCreated,
}) => {
  const { user } = useUser();
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [numGrupos, setNumGrupos] = useState(2);
  const [draftTournamentId, setDraftTournamentId] = useState<string | null>(null);
  const [jugadores, setJugadores] = useState<Player[]>([]);
  const [parejas, setParejas] = useState<ParejaDraft[]>([]);
  const [jugador1Id, setJugador1Id] = useState("");
  const [jugador2Id, setJugador2Id] = useState("");
  const [assignments, setAssignments] = useState<GrupoAssignmentDraft[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [addingPair, setAddingPair] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerIdsInPairs = useMemo(() => {
    const ids = new Set<string>();
    parejas.forEach((p) => {
      ids.add(p.jugador1.id);
      ids.add(p.jugador2.id);
    });
    return ids;
  }, [parejas]);

  const syncParejasFromPlayers = useCallback(
    (list: Player[]) => {
      setParejas((prev) =>
        prev.map((p) => ({
          ...p,
          jugador1: list.find((j) => j.id === p.jugador1.id) ?? p.jugador1,
          jugador2: list.find((j) => j.id === p.jugador2.id) ?? p.jugador2,
        }))
      );
    },
    []
  );

  const handleJugadoresChange = useCallback(
    (list: Player[]) => {
      setJugadores(list);
      syncParejasFromPlayers(list);
    },
    [syncParejasFromPlayers]
  );

  const loadPairsForDraft = useCallback(
    async (tournamentId: string, players: Player[]) => {
      const rows = await fetchPairsForTournament(tournamentId);
      const byId = new Map(players.map((p) => [p.id, p]));
      const drafts: ParejaDraft[] = [];
      for (const row of rows ?? []) {
        const j1 =
          byId.get(row.player1_id) ??
          ({
            id: row.player1_id,
            name: row.player1_name,
            email: "",
            created_at: row.created_at,
          } as Player);
        const j2 =
          byId.get(row.player2_id) ??
          ({
            id: row.player2_id,
            name: row.player2_name,
            email: "",
            created_at: row.created_at,
          } as Player);
        drafts.push({ id: row.id, jugador1: j1, jugador2: j2 });
      }
      setParejas(drafts);
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
    const n = Math.max(2, Math.min(8, numGrupos));
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

  const optionsJ1 = useMemo(
    () =>
      jugadores.filter(
        (j) => !playerIdsInPairs.has(j.id) || j.id === jugador1Id
      ),
    [jugadores, playerIdsInPairs, jugador1Id]
  );

  const optionsJ2 = useMemo(
    () =>
      jugadores.filter(
        (j) =>
          j.id !== jugador1Id &&
          (!playerIdsInPairs.has(j.id) || j.id === jugador2Id)
      ),
    [jugadores, playerIdsInPairs, jugador1Id, jugador2Id]
  );

  const agregarPareja = async () => {
    if (!user?.id || !draftTournamentId) return;
    if (!jugador1Id || !jugador2Id) {
      setError("Selecciona dos jugadores");
      return;
    }
    if (jugador1Id === jugador2Id) {
      setError("Los jugadores de una pareja deben ser distintos");
      return;
    }
    if (playerIdsInPairs.has(jugador1Id) || playerIdsInPairs.has(jugador2Id)) {
      setError("Uno de los jugadores ya está en otra pareja");
      return;
    }

    const j1 = jugadores.find((j) => j.id === jugador1Id);
    const j2 = jugadores.find((j) => j.id === jugador2Id);
    if (!j1 || !j2) return;

    setAddingPair(true);
    setError(null);
    try {
      const pair = await createPair(
        draftTournamentId,
        jugador1Id,
        jugador2Id,
        user.id
      );
      setParejas((prev) => [
        ...prev,
        {
          id: pair.id,
          jugador1: j1,
          jugador2: j2,
        },
      ]);
      setJugador1Id("");
      setJugador2Id("");
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
      const torneoId = await createTorneoExpressWithGroups({
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        sourceTournamentId: draftTournamentId,
        grupos: assignments,
      });
      sessionStorage.removeItem(TE_DRAFT_TOURNAMENT_KEY);
      onTorneoCreated?.();
      navigateTorneoExpress(`/torneo-express/${torneoId}/gestionar`);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="te-crear-grid">
        <div className="te-crear-col te-crear-col--players">
          {user?.id ? (
            <TorneoExpressPlayerPanel
              userId={user.id}
              parejas={parejas}
              onJugadoresChange={handleJugadoresChange}
            />
          ) : (
            <aside className="te-players-panel torneo-express-card">
              <p className="te-players-empty">Inicia sesión para gestionar jugadores</p>
            </aside>
          )}
        </div>

        <div className="te-crear-col te-crear-col--form">
          <form className="torneo-express-card te-crear-form" onSubmit={handleSubmit}>
            <header className="te-crear-form__header">
              <h1 className="te-title">
                <span aria-hidden>🏆</span>
                Nuevo torneo
              </h1>
              <p className="te-subtitle">Grupos + round robin por grupo</p>
            </header>

            {error && <p className="te-error">{error}</p>}

            {initializing ? (
              <p className="te-subtitle">Preparando borrador…</p>
            ) : (
              <>
                <div className="torneo-express-field">
                  <label htmlFor="te-nombre">Nombre del torneo</label>
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
                  <label htmlFor="te-grupos">Número de grupos</label>
                  <input
                    id="te-grupos"
                    type="number"
                    min={2}
                    max={8}
                    value={numGrupos}
                    onChange={(e) => setNumGrupos(Number(e.target.value) || 2)}
                  />
                </div>

                <section className="te-armar-parejas">
                  <h2 className="te-section-title">Armar parejas</h2>
                  <p className="te-subtitle">
                    Elige jugadores del panel de jugadores. Los nombres se
                    actualizan al editarlos allí.
                  </p>

                  <div className="te-pareja-form-row te-pareja-form-row--inline">
                    <div className="torneo-express-field">
                      <label htmlFor="te-j1">Jugador 1</label>
                      <select
                        id="te-j1"
                        value={jugador1Id}
                        onChange={(e) => setJugador1Id(e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        {optionsJ1.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="te-pareja-form-row__sep" aria-hidden>
                      /
                    </span>
                    <div className="torneo-express-field">
                      <label htmlFor="te-j2">Jugador 2</label>
                      <select
                        id="te-j2"
                        value={jugador2Id}
                        onChange={(e) => setJugador2Id(e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        {optionsJ2.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="te-btn-agregar-pareja"
                    onClick={() => void agregarPareja()}
                    disabled={
                      addingPair ||
                      !jugador1Id ||
                      !jugador2Id ||
                      jugador1Id === jugador2Id
                    }
                    loading={addingPair}
                  >
                    {addingPair ? "Agregando…" : "+ Agregar pareja"}
                  </Button>

                  {parejas.length > 0 && (
                    <ul className="te-parejas-formadas">
                      {parejas.map((p) => (
                        <li key={p.id} className="te-pareja-formada">
                          <span>
                            {p.jugador1.name} / {p.jugador2.name}
                          </span>
                          <button
                            type="button"
                            className="te-players-icon-btn te-players-icon-btn--danger"
                            onClick={() => void eliminarPareja(p)}
                            aria-label="Eliminar pareja"
                            title="Eliminar pareja"
                          >
                            🗑️
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {parejas.length > 0 &&
                  assignments.map((grupo, gi) => (
                    <div key={grupo.orden} className="te-grupo-assignment">
                      <div className="torneo-express-field te-grupo-assignment__name">
                        <label>Nombre del grupo</label>
                        <input
                          value={grupo.nombre}
                          onChange={(e) =>
                            setAssignments((prev) =>
                              prev.map((g, i) =>
                                i === gi ? { ...g, nombre: e.target.value } : g
                              )
                            )
                          }
                        />
                      </div>
                      <p className="te-subtitle">
                        Parejas asignadas: {grupo.parejaIds.length} (mín. 2)
                      </p>
                      <div className="te-pareja-pool">
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
                              onClick={() => togglePair(gi, p.id)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                <Button
                  type="submit"
                  variant="primary"
                  className="te-crear-submit"
                  disabled={submitting || parejas.length < 2}
                  loading={submitting}
                >
                  <span className="te-crear-submit__icon" aria-hidden>
                    ⚡
                  </span>
                  {submitting ? "Creando…" : "Crear torneo y generar partidos"}
                </Button>
              </>
            )}
          </form>
        </div>
    </div>
  );
};

