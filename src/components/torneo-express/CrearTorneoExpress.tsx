import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPair,
  createTournament,
  dedupeLegacyPlayersByName,
  deletePair,
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
  pruneDraftPairsForTournament,
} from "../../services/torneoExpressService";
import { navigateTorneoExpress } from "./torneoExpressNav";
import { ArmarParejasPicker } from "./ArmarParejasPicker";
import { AsignarParejasGrupos } from "./AsignarParejasGrupos";
import { TorneoExpressPlayerPanel } from "./TorneoExpressPlayerPanel";
import {
  ParejaDraft,
  TE_DRAFT_TOURNAMENT_KEY,
  TE_EXPRESS_DRAFT_TOURNAMENT_NAME,
} from "./crearTorneoExpressTypes";
import { persistTournamentGameMode } from "../../lib/gameModeMapping";
import {
  dedupeParejaDraftsByPlayerName,
  dedupePlayersById,
  normalizePlayerNameKey,
  resolvePlayerInPool,
  splitParejaDraftsByPlayerName,
} from "../../lib/rivieraJugadores/playerNameKey";
import { playerNeedsEmailContact } from "../../services/torneoExpressNotificacionesService";
import { Button } from "../ui";

type PlayerWithContact = Player & {
  email_verified?: boolean | null;
};

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
  const [assignments, setAssignments] = useState<GrupoAssignmentDraft[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [addingPair, setAddingPair] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    () => dedupeLegacyPlayersByName(dedupePlayersById(jugadores)),
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
      const deduped = dedupeLegacyPlayersByName(dedupePlayersById(list));
      setJugadores(deduped);
      syncParejasFromPlayers(deduped);
    },
    [syncParejasFromPlayers]
  );

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
      const { kept, droppedIds } = splitParejaDraftsByPlayerName(
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

  const formarPareja = async (j1: Player, j2: Player) => {
    if (!user?.id || !draftTournamentId) return;

    const k1 = normalizePlayerNameKey(j1.name);
    const k2 = normalizePlayerNameKey(j2.name);
    if (!k1 || !k2 || k1 === k2) {
      setError("Elige dos jugadores distintos");
      return;
    }

    const yaEnPareja = parejas.some((p) => {
      const p1 = normalizePlayerNameKey(p.jugador1.name);
      const p2 = normalizePlayerNameKey(p.jugador2.name);
      return (
        (k1 && (p1 === k1 || p2 === k1)) || (k2 && (p1 === k2 || p2 === k2))
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
        dedupeParejaDraftsByPlayerName([
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

                <div className="te-crear-notif-hint" role="note">
                  <strong>Notificaciones automáticas</strong>
                  <p>
                    Al pulsar «Crear torneo», cada jugador con{" "}
                    <strong>email real</strong> en el registro recibe aviso de
                    inscripción y grupo por email.
                    Los que marquen «⚠️ sin email» no recibirán nada.
                  </p>
                </div>

                {jugadoresEnParejasSinEmail.length > 0 ? (
                  <p className="te-crear-notif-warn" role="alert">
                    {jugadoresEnParejasSinEmail.length} jugador(es) en tus parejas
                    aún sin email:{" "}
                    {jugadoresEnParejasSinEmail.map((j) => j.name).join(", ")}.
                    Completa su contacto con 📧 antes de crear el torneo.
                  </p>
                ) : null}

                <ArmarParejasPicker
                  jugadoresPool={jugadoresPool}
                  parejas={parejas}
                  addingPair={addingPair}
                  onFormarPareja={(j1, j2) => void formarPareja(j1, j2)}
                  onEliminarPareja={(p) => void eliminarPareja(p)}
                />

                <AsignarParejasGrupos
                  parejas={parejas}
                  assignments={assignments}
                  assignedIds={assignedIds}
                  onAssignmentsChange={setAssignments}
                  onTogglePair={togglePair}
                />

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

