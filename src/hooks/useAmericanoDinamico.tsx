import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { AmericanoMatch, AmericanoPlayer, AmericanoRound } from "../lib/db/types";
import {
  buildMatricesFromScoredRounds,
  generateAmericanoRound,
} from "../lib/americanoGenerator";
import {
  computeAmericanoLiveRanking,
  filterScoredAmericanoRounds,
} from "../lib/americanoLiveStandings";
import {
  applyAmericanoResult,
} from "../lib/americanoStandings";
import type { AmericanoDinamicoSnapshotV1 } from "../lib/americanoDinamicoStorage";
import {
  buildAmericanoSnapshotRound,
  clearAmericanoDinamicoSnapshot,
  loadAmericanoDinamicoSnapshot,
  resolveAmericanoTournamentId,
} from "../lib/americanoDinamicoStorage";
import { applyAmericanoSnapshotToState } from "../lib/americanoDinamicoRestore";
import {
  loadAmericanoDinamicoSnapshotMerged,
  persistAmericanoDinamicoMatchScore,
  persistAmericanoNewRound,
  resetAmericanoDinamicoRemote,
} from "../lib/americanoDinamicoSync";
import { aplicarRatingAmericanoPartido } from "../lib/rivieraJugadores/aplicarRatingPartido";

type AmericanoPhase = "registration" | "playing" | "finished";

function createEmptyStats() {
  return {
    pointsFor: 0,
    pointsAgainst: 0,
    gamesPlayed: 0,
    roundsOnBench: 0,
  };
}

/** Partido ya tenía marcador válido → corrección requiere force en la RPC. */
function matchAlreadyHasScore(match: {
  scoreA?: number;
  scoreB?: number;
}): boolean {
  return (
    typeof match.scoreA === "number" &&
    typeof match.scoreB === "number" &&
    Number.isFinite(match.scoreA) &&
    Number.isFinite(match.scoreB) &&
    match.scoreA >= 0 &&
    match.scoreB >= 0
  );
}

function findMatchInRounds(
  rounds: AmericanoRound[],
  matchId: string
): AmericanoMatch | undefined {
  for (const round of rounds) {
    const found = round.matches.find((m) => m.id === matchId);
    if (found) return found;
  }
  return undefined;
}

function rosterTemplateFromRef(
  baseRosterRef: MutableRefObject<AmericanoPlayer[]>,
  players: AmericanoPlayer[]
): AmericanoPlayer[] {
  if (baseRosterRef.current.length > 0) {
    return baseRosterRef.current.map((p) => ({
      id: p.id,
      name: p.name,
      stats: createEmptyStats(),
    }));
  }
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    stats: createEmptyStats(),
  }));
}

function rebuildStateFromRounds(
  sourceRounds: AmericanoRound[],
  sourcePlayers: AmericanoPlayer[]
): { players: AmericanoPlayer[]; rounds: AmericanoRound[] } {
  const rebuiltPlayers = sourcePlayers.map((p) => ({
    ...p,
    stats: createEmptyStats(),
  }));
  const playerMap = new Map(rebuiltPlayers.map((p) => [p.id, p]));

  const rebuiltRounds: AmericanoRound[] = sourceRounds.map((round) => {
    const benchPlayers = round.benchPlayers
      .map((p) => playerMap.get(p.id))
      .filter((p): p is AmericanoPlayer => !!p);
    benchPlayers.forEach((p) => {
      p.stats.roundsOnBench += 1;
    });

    const matches = round.matches.map((match) => ({
      ...match,
      teamA: [
        playerMap.get(match.teamA[0].id)!,
        playerMap.get(match.teamA[1].id)!,
      ] as [AmericanoPlayer, AmericanoPlayer],
      teamB: [
        playerMap.get(match.teamB[0].id)!,
        playerMap.get(match.teamB[1].id)!,
      ] as [AmericanoPlayer, AmericanoPlayer],
    }));

    return {
      ...round,
      matches,
      benchPlayers,
    };
  });

  rebuiltRounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (
        typeof match.scoreA === "number" &&
        typeof match.scoreB === "number" &&
        match.scoreA >= 0 &&
        match.scoreB >= 0
      ) {
        applyAmericanoResult(match, match.scoreA, match.scoreB);
      }
    });
  });

  return { players: rebuiltPlayers, rounds: rebuiltRounds };
}

export interface UseAmericanoDinamicoOptions {
  organizadorId?: string | null;
  /** Nombre visible en el historial Riviera (p. ej. nombre de la reta). */
  sessionLabel?: string;
}

export function useAmericanoDinamico(
  tournamentId?: string | null,
  options?: UseAmericanoDinamicoOptions
) {
  const resolvedTournamentId = resolveAmericanoTournamentId(tournamentId);
  const [players, setPlayers] = useState<AmericanoPlayer[]>([]);
  const [rounds, setRounds] = useState<AmericanoRound[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [phase, setPhase] = useState<AmericanoPhase>("registration");
  const [hydrating, setHydrating] = useState(() => Boolean(resolvedTournamentId));
  const [remoteSyncReady, setRemoteSyncReady] = useState(true);

  const baseRosterRef = useRef<AmericanoPlayer[]>([]);
  const totalRoundsRef = useRef(0);
  const courtsRef = useRef(1);
  const roundsRef = useRef(rounds);
  const currentRoundIndexRef = useRef(currentRoundIndex);
  const playersRef = useRef(players);
  const sesionIdRef = useRef<string>(
    resolvedTournamentId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `americano-${Date.now()}`)
  );
  const participacionSyncedRef = useRef(false);
  const participacionSyncInFlightRef = useRef(false);
  const [participacionSyncError, setParticipacionSyncError] = useState<string | null>(
    null
  );

  /**
   * FC-01 (Fase C1): avanzar de ronda (iniciar el torneo o generar la
   * siguiente) ahora requiere confirmación del servidor antes de reflejarse
   * en la UI — evita la falsa sensación de "guardado" que causaba el bug
   * original (rounds nunca llegaba a la base). Mientras `roundSyncPending`
   * es true, la UI debe deshabilitar el botón de avance; si
   * `roundSyncError` no es null, debe mostrarlo y permitir reintentar (la
   * operación es idempotente, reintentar es seguro).
   */
  const [roundSyncPending, setRoundSyncPending] = useState(false);
  const [roundSyncError, setRoundSyncError] = useState<string | null>(null);

  const runParticipacionSync = useCallback(async () => {
    if (!options?.organizadorId || playersRef.current.length === 0) return;
    if (participacionSyncedRef.current || participacionSyncInFlightRef.current) {
      return;
    }

    participacionSyncInFlightRef.current = true;
    setParticipacionSyncError(null);

    const label = options.sessionLabel?.trim() || "Sesión";
    try {
      const { finalizeCareerEvent } = await import(
        "../lib/rivieraJugadores/careerEventPipeline"
      );
      const result = await finalizeCareerEvent({
        kind: "americano",
        organizadorId: options.organizadorId,
        sesionId: sesionIdRef.current,
        nombre: label,
        roster: playersRef.current,
        rounds: roundsRef.current,
        // Perf batch-1 (2026-08-08): mismo patrón ya probado en Reta.
        options: { telemetry: true, identityCache: true },
      });

      if (result.ok) {
        participacionSyncedRef.current = true;
        setParticipacionSyncError(null);
      } else {
        const detail =
          result.failures.map((f) => f.message).join("; ") ||
          "No se pudo registrar el historial del americano.";
        console.error(
          "[riviera-jugadores] sync tras finalizar americano incompleto:",
          result
        );
        setParticipacionSyncError(detail);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al registrar el historial.";
      console.error("[riviera-jugadores] sync tras finalizar americano:", err);
      setParticipacionSyncError(message);
    } finally {
      participacionSyncInFlightRef.current = false;
    }
  }, [options?.organizadorId, options?.sessionLabel]);

  const retryParticipacionSync = useCallback(() => {
    participacionSyncedRef.current = false;
    void runParticipacionSync();
  }, [runParticipacionSync]);

  useEffect(() => {
    participacionSyncedRef.current = false;
    setParticipacionSyncError(null);
    setHydrating(Boolean(resolvedTournamentId));
    setRemoteSyncReady(true);
  }, [resolvedTournamentId]);

  const applySnapshot = useCallback(
    (snap: AmericanoDinamicoSnapshotV1) => {
      applyAmericanoSnapshotToState(
        snap,
        { setPlayers, setRounds, setCurrentRoundIndex, setPhase },
        { baseRosterRef, totalRoundsRef, courtsRef }
      );
    },
    []
  );

  /** Caché local inmediata (mismo dispositivo). */
  useLayoutEffect(() => {
    if (!resolvedTournamentId) return;
    const snap = loadAmericanoDinamicoSnapshot(resolvedTournamentId);
    if (!snap) return;
    applySnapshot(snap);
  }, [resolvedTournamentId, applySnapshot]);

  /** Supabase: fuente de verdad entre dispositivos. */
  useEffect(() => {
    if (!resolvedTournamentId) {
      setHydrating(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { snapshot, remoteAvailable } =
          await loadAmericanoDinamicoSnapshotMerged(resolvedTournamentId);
        if (cancelled) return;
        if (snapshot) {
          applySnapshot(snapshot);
        }
        if (!remoteAvailable) {
          setRemoteSyncReady(false);
        }
      } catch (e) {
        console.warn("Americano: no se pudo sincronizar desde Supabase.", e);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedTournamentId, applySnapshot]);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);
  useEffect(() => {
    currentRoundIndexRef.current = currentRoundIndex;
  }, [currentRoundIndex]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const removePlayer = (id: string) => {
    if (phase !== "registration") return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleExistingPlayer = (player: { id: string; name: string }) => {
    if (phase !== "registration") return;
    setPlayers((prev) => {
      const exists = prev.some((p) => p.id === player.id);
      if (exists) return prev.filter((p) => p.id !== player.id);
      return [
        ...prev,
        { id: player.id, name: player.name, stats: createEmptyStats() },
      ];
    });
  };

  /** Sync roster from ModernPlayerManager multi-select (preserves stats). */
  const syncRegistrationPlayers = (
    next: ReadonlyArray<{ id: string; name: string }>
  ) => {
    if (phase !== "registration") return;
    setPlayers((prev) => {
      const prevById = new Map(prev.map((p) => [p.id, p]));
      return next.map(
        (p) =>
          prevById.get(p.id) ?? {
            id: p.id,
            name: p.name,
            stats: createEmptyStats(),
          }
      );
    });
  };

  const startTournament = useCallback(
    async (totalRounds: number, courts: number = 1): Promise<boolean> => {
      if (players.length < 4 || totalRounds < 1) return false;
      const safeCourts = Math.max(1, Math.floor(courts) || 1);

      const seededPlayers = players.map((p) => ({
        ...p,
        stats: createEmptyStats(),
      }));
      const seededBaseRoster = seededPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        stats: createEmptyStats(),
      }));

      const { partnerMatrix, rivalMatrix } = buildMatricesFromScoredRounds(
        seededPlayers,
        []
      );
      const r1 = generateAmericanoRound({
        allPlayers: seededPlayers,
        roundNumber: 1,
        totalRounds,
        courts: safeCourts,
        partnerMatrix,
        rivalMatrix,
        lastBenchPlayerIds: new Set(),
        priorRounds: [],
        scoredRounds: [],
      });

      const commit = (round: AmericanoRound) => {
        totalRoundsRef.current = totalRounds;
        courtsRef.current = safeCourts;
        baseRosterRef.current = seededBaseRoster;
        participacionSyncedRef.current = false;
        sesionIdRef.current =
          resolvedTournamentId ??
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `americano-${Date.now()}`);
        setPlayers(seededPlayers);
        setRounds([round]);
        setCurrentRoundIndex(0);
        setPhase("playing");
      };

      if (!resolvedTournamentId) {
        // Sin id de torneo persistible (uso local-only, fuera del flujo
        // normal de la app) — no hay servidor al que empujar la ronda.
        commit(r1);
        return true;
      }

      setRoundSyncPending(true);
      setRoundSyncError(null);
      try {
        const result = await persistAmericanoNewRound({
          tournamentId: resolvedTournamentId,
          roundNumber: 1,
          round: buildAmericanoSnapshotRound(r1),
          ranking: [],
          phase: "playing",
          totalRounds,
          roster: seededBaseRoster.map((p) => ({ id: p.id, name: p.name })),
        });

        if (result.status === "created") {
          commit(r1);
          return true;
        }
        if (result.status === "exists") {
          // Otra pestaña/dispositivo ya inició este torneo — adoptamos la
          // ronda 1 autoritativa del servidor en vez de la generada aquí
          // (mismo principio que reconcileMatchScore para marcadores).
          commit(result.round as unknown as AmericanoRound);
          return true;
        }
        setRoundSyncError(
          "No se pudo iniciar el torneo. Verifica tu conexión e intenta de nuevo."
        );
        return false;
      } catch (e) {
        console.warn("[americano-live] startTournament:", e);
        setRoundSyncError(
          "No se pudo iniciar el torneo. Verifica tu conexión e intenta de nuevo."
        );
        return false;
      } finally {
        setRoundSyncPending(false);
      }
    },
    [players, resolvedTournamentId]
  );

  const persistRebuiltState = useCallback((nextRounds: AmericanoRound[]) => {
    const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
    const rebuilt = rebuildStateFromRounds(nextRounds, template);
    setRounds(rebuilt.rounds);
    setPlayers(rebuilt.players);
  }, []);

  /**
   * Reconcilia el estado local con el resultado REAL del servidor cuando
   * apply_americano_live_match_score() devuelve conflicto (BLK-02) — evita
   * que el intento rechazado del usuario quede divergiendo en silencio del
   * valor ya guardado por otro dispositivo.
   */
  const reconcileMatchScore = useCallback(
    (matchId: string, scoreA: number, scoreB: number) => {
      const prevRounds = roundsRef.current;
      const nextRounds = prevRounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) =>
          match.id === matchId ? { ...match, scoreA, scoreB } : match
        ),
      }));
      persistRebuiltState(nextRounds);
    },
    [persistRebuiltState]
  );

  const commitRoundScores = useCallback(
    (scores: { matchId: string; scoreA: number; scoreB: number }[]) => {
      if (phase !== "playing") return;
      const map = new Map(scores.map((s) => [s.matchId, s]));
      const idx = currentRoundIndexRef.current;
      const prevRounds = roundsRef.current;
      const nextRounds = prevRounds.map((round, roundIdx) => {
        if (roundIdx !== idx) return round;
        return {
          ...round,
          matches: round.matches.map((match) => {
            const s = map.get(match.id);
            return s
              ? { ...match, scoreA: s.scoreA, scoreB: s.scoreB }
              : match;
          }),
        };
      });
      persistRebuiltState(nextRounds);

      if (options?.organizadorId) {
        const round = nextRounds[idx];
        for (const m of round?.matches ?? []) {
          void aplicarRatingAmericanoPartido(options.organizadorId, m).catch(
            (e) => console.warn("[rating] americano:", e)
          );
        }
      }

      // Guardado atómico server-side por partido (BLK-02): dos dispositivos
      // guardando partidos distintos nunca se pisan entre sí. Si el servidor
      // reporta conflicto (mismo partido ya guardado con otro resultado por
      // otro dispositivo), se reconcilia el estado local con el valor real
      // del servidor en vez de dejarlo divergir en silencio.
      if (resolvedTournamentId) {
        for (const s of scores) {
          const previous = findMatchInRounds(prevRounds, s.matchId);
          const force = previous ? matchAlreadyHasScore(previous) : false;
          void persistAmericanoDinamicoMatchScore({
            tournamentId: resolvedTournamentId,
            matchId: s.matchId,
            scoreA: s.scoreA,
            scoreB: s.scoreB,
            force,
          })
            .then((result) => {
              if (result.status === "conflict") {
                console.warn(
                  "[americano-live] conflicto en partido, reconciliando con el servidor:",
                  s.matchId
                );
                reconcileMatchScore(s.matchId, result.scoreA, result.scoreB);
              }
            })
            .catch((e) => console.warn("[americano-live] commitRoundScores:", e));
        }
      }
    },
    [
      phase,
      persistRebuiltState,
      options?.organizadorId,
      resolvedTournamentId,
      reconcileMatchScore,
    ]
  );

  const submitScore = useCallback(
    (matchId: string, scoreA: number, scoreB: number) => {
      if (phase !== "playing") return;
      const idx = currentRoundIndexRef.current;
      const prevRounds = roundsRef.current;
      const nextRounds = prevRounds.map((round, roundIdx) => {
        if (roundIdx !== idx) return round;
        return {
          ...round,
          matches: round.matches.map((match) =>
            match.id === matchId ? { ...match, scoreA, scoreB } : match
          ),
        };
      });
      persistRebuiltState(nextRounds);

      if (options?.organizadorId) {
        const round = nextRounds[idx];
        const m = round?.matches.find((match) => match.id === matchId);
        if (m) {
          void aplicarRatingAmericanoPartido(options.organizadorId, m).catch(
            (e) => console.warn("[rating] americano:", e)
          );
        }
      }

      // Guardado atómico server-side por partido (BLK-02). Igual que en
      // commitRoundScores: si hay conflicto, reconcilia con el servidor.
      if (resolvedTournamentId) {
        const previous = findMatchInRounds(prevRounds, matchId);
        const force = previous ? matchAlreadyHasScore(previous) : false;
        void persistAmericanoDinamicoMatchScore({
          tournamentId: resolvedTournamentId,
          matchId,
          scoreA,
          scoreB,
          force,
        })
          .then((result) => {
            if (result.status === "conflict") {
              console.warn(
                "[americano-live] conflicto en partido, reconciliando con el servidor:",
                matchId
              );
              reconcileMatchScore(matchId, result.scoreA, result.scoreB);
            }
          })
          .catch((e) => console.warn("[americano-live] submitScore:", e));
      }
    },
    [
      phase,
      persistRebuiltState,
      options?.organizadorId,
      resolvedTournamentId,
      reconcileMatchScore,
    ]
  );

  const editScore = useCallback(
    (roundIndex: number, matchId: string, scoreA: number, scoreB: number) => {
      if (
        !Number.isFinite(scoreA) ||
        !Number.isFinite(scoreB) ||
        scoreA < 0 ||
        scoreB < 0
      ) {
        return;
      }
      const prevRounds = roundsRef.current;
      const previous = findMatchInRounds(prevRounds, matchId);
      const nextRounds = prevRounds.map((round, idx) => {
        if (idx !== roundIndex) return round;
        return {
          ...round,
          matches: round.matches.map((match) =>
            match.id === matchId ? { ...match, scoreA, scoreB } : match
          ),
        };
      });
      persistRebuiltState(nextRounds);

      // Corrección desde Historial: siempre force si ya había marcador.
      // Sin esto solo se actualiza localStorage y Supabase vuelve a pisar el valor viejo.
      if (resolvedTournamentId) {
        const force = previous ? matchAlreadyHasScore(previous) : true;
        void persistAmericanoDinamicoMatchScore({
          tournamentId: resolvedTournamentId,
          matchId,
          scoreA,
          scoreB,
          force,
        })
          .then((result) => {
            if (result.status === "conflict") {
              console.warn(
                "[americano-live] conflicto al corregir partido, reconciliando:",
                matchId
              );
              reconcileMatchScore(matchId, result.scoreA, result.scoreB);
            }
          })
          .catch((e) => console.warn("[americano-live] editScore:", e));
      }

      if (options?.organizadorId) {
        const round = nextRounds[roundIndex];
        const m = round?.matches.find((match) => match.id === matchId);
        if (m) {
          void aplicarRatingAmericanoPartido(options.organizadorId, m).catch(
            (e) => console.warn("[rating] americano edit:", e)
          );
        }
      }
    },
    [
      persistRebuiltState,
      resolvedTournamentId,
      reconcileMatchScore,
      options?.organizadorId,
    ]
  );

  const nextRound = useCallback(async (): Promise<boolean> => {
    if (phase !== "playing") return false;
    const prevRounds = roundsRef.current;
    const idx = currentRoundIndexRef.current;
    const cur = prevRounds[idx];
    if (!cur) return false;

    const allScores = cur.matches.every(
      (m) =>
        typeof m.scoreA === "number" &&
        typeof m.scoreB === "number" &&
        !Number.isNaN(m.scoreA) &&
        !Number.isNaN(m.scoreB) &&
        m.scoreA >= 0 &&
        m.scoreB >= 0
    );
    if (!allScores) return false;

    const total = totalRoundsRef.current;
    if (idx + 1 >= total) {
      setPhase("finished");
      return true;
    }

    const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
    const rebuilt = rebuildStateFromRounds(prevRounds, template);
    const scoredRounds = filterScoredAmericanoRounds(rebuilt.rounds);
    const { partnerMatrix, rivalMatrix } = buildMatricesFromScoredRounds(
      rebuilt.players,
      scoredRounds
    );

    const lastBenchIds = new Set(
      prevRounds[idx].benchPlayers.map((p) => p.id)
    );

    const nextRoundNumber = idx + 2;
    const newRound = generateAmericanoRound({
      allPlayers: rebuilt.players,
      roundNumber: nextRoundNumber,
      totalRounds: total,
      courts: courtsRef.current,
      partnerMatrix,
      rivalMatrix,
      lastBenchPlayerIds: lastBenchIds,
      priorRounds: rebuilt.rounds,
      scoredRounds,
    });

    const commit = (round: AmericanoRound) => {
      setPlayers(rebuilt.players);
      setRounds([...rebuilt.rounds, round]);
      setCurrentRoundIndex(idx + 1);
    };

    if (!resolvedTournamentId) {
      commit(newRound);
      return true;
    }

    setRoundSyncPending(true);
    setRoundSyncError(null);
    try {
      const result = await persistAmericanoNewRound({
        tournamentId: resolvedTournamentId,
        roundNumber: nextRoundNumber,
        round: buildAmericanoSnapshotRound(newRound),
        ranking: rebuilt.players.map((p) => ({ id: p.id, name: p.name, stats: p.stats })),
        phase: "playing",
        totalRounds: total,
      });

      if (result.status === "created") {
        commit(newRound);
        return true;
      }
      if (result.status === "exists") {
        // Otra pestaña ya generó esta ronda -- adoptamos la del servidor en
        // vez de la generada aquí, para no divergir del bracket real.
        commit(result.round as unknown as AmericanoRound);
        return true;
      }
      setRoundSyncError(
        "No se pudo guardar la siguiente ronda. Verifica tu conexión e intenta de nuevo."
      );
      return false;
    } catch (e) {
      console.warn("[americano-live] nextRound:", e);
      setRoundSyncError(
        "No se pudo guardar la siguiente ronda. Verifica tu conexión e intenta de nuevo."
      );
      return false;
    } finally {
      setRoundSyncPending(false);
    }
  }, [phase, resolvedTournamentId]);

  /**
   * Reiniciar el americano a "recién creado" (registro vacío). SOLO permitido
   * mientras NO ha finalizado: así no hay participaciones/ranking/ROMC ya
   * registrados que revertir (esos se escriben al finalizar). Limpia estado
   * local, caché local y snapshot remoto; NO toca la tabla `tournaments`
   * (los flags is_started/is_finished los ajusta el componente de pantalla).
   */
  const resetTournament = useCallback(async (): Promise<boolean> => {
    if (phase === "finished") return false;

    setPlayers([]);
    setRounds([]);
    setCurrentRoundIndex(0);
    setPhase("registration");
    baseRosterRef.current = [];
    totalRoundsRef.current = 0;
    courtsRef.current = 1;
    roundsRef.current = [];
    playersRef.current = [];
    participacionSyncedRef.current = false;
    setParticipacionSyncError(null);
    setRoundSyncPending(false);
    setRoundSyncError(null);

    if (!resolvedTournamentId) return true;
    clearAmericanoDinamicoSnapshot(resolvedTournamentId);
    try {
      await resetAmericanoDinamicoRemote(resolvedTournamentId);
    } catch (e) {
      console.warn("[americano-live] no se pudo reiniciar el snapshot remoto:", e);
    }
    return true;
  }, [phase, resolvedTournamentId]);

  const ranking = useMemo(() => {
    if (phase === "registration") return [];
    const roster = rosterTemplateFromRef(baseRosterRef, players);
    if (roster.length === 0) return [];
    return computeAmericanoLiveRanking(roster, rounds);
  }, [phase, rounds, players]);

  const rosterForUi = useMemo(
    () => rosterTemplateFromRef(baseRosterRef, players),
    [players]
  );

  const currentRound = useMemo(
    () => (phase === "playing" ? rounds[currentRoundIndex] ?? null : null),
    [phase, rounds, currentRoundIndex]
  );

  useEffect(() => {
    if (phase !== "finished") return;
    void runParticipacionSync();
  }, [phase, options?.organizadorId, players.length, runParticipacionSync]);

  return {
    players,
    rounds,
    currentRoundIndex,
    phase,
    totalRounds: totalRoundsRef.current,
    hydrating,
    remoteSyncReady,
    participacionSyncError,
    retryParticipacionSync,
    roundSyncPending,
    roundSyncError,
    removePlayer,
    toggleExistingPlayer,
    syncRegistrationPlayers,
    startTournament,
    commitRoundScores,
    submitScore,
    editScore,
    nextRound,
    resetTournament,
    ranking,
    rosterForUi,
    currentRound,
  };
}
