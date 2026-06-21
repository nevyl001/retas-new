import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { AmericanoPlayer, AmericanoRound } from "../lib/db/types";
import {
  buildMatricesFromScoredRounds,
  generateAmericanoRound,
  regenerateUnscoredSecondHalfRound,
} from "../lib/americanoGenerator";
import {
  computeAmericanoLiveRanking,
  filterScoredAmericanoRounds,
  rosterSeedMap,
} from "../lib/americanoLiveStandings";
import {
  applyAmericanoResult,
} from "../lib/americanoStandings";
import type { AmericanoDinamicoSnapshotV1 } from "../lib/americanoDinamicoStorage";
import {
  loadAmericanoDinamicoSnapshot,
  resolveAmericanoTournamentId,
} from "../lib/americanoDinamicoStorage";
import { applyAmericanoSnapshotToState } from "../lib/americanoDinamicoRestore";
import { loadAmericanoDinamicoSnapshotMerged } from "../lib/americanoDinamicoSync";

type AmericanoPhase = "registration" | "playing" | "finished";

function createEmptyStats() {
  return {
    pointsFor: 0,
    pointsAgainst: 0,
    gamesPlayed: 0,
    roundsOnBench: 0,
  };
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

function refreshUnscoredSecondHalfRoundsFrom(
  players: AmericanoPlayer[],
  allRounds: AmericanoRound[],
  fromIndex: number,
  totalRounds: number,
  courts: number,
  seedById: Map<string, number>
): AmericanoRound[] {
  let out = allRounds;
  for (let i = Math.max(0, fromIndex); i < out.length; i++) {
    const refreshed = regenerateUnscoredSecondHalfRound(
      players,
      out,
      i,
      totalRounds,
      courts,
      seedById
    );
    if (refreshed) out = refreshed;
  }
  return out;
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

  useEffect(() => {
    participacionSyncedRef.current = false;
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

  const startTournament = (totalRounds: number, courts: number = 1) => {
    if (players.length < 4 || totalRounds < 1) return;
    const safeCourts = Math.max(1, Math.floor(courts) || 1);
    totalRoundsRef.current = totalRounds;
    courtsRef.current = safeCourts;

    const seededPlayers = players.map((p) => ({
      ...p,
      stats: createEmptyStats(),
    }));

    baseRosterRef.current = seededPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      stats: createEmptyStats(),
    }));

    participacionSyncedRef.current = false;
    sesionIdRef.current =
      resolvedTournamentId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `americano-${Date.now()}`);

    const { partnerMatrix } = buildMatricesFromScoredRounds(seededPlayers, []);
    const r1 = generateAmericanoRound({
      allPlayers: seededPlayers,
      roundNumber: 1,
      totalRounds,
      courts: safeCourts,
      partnerMatrix,
      lastBenchPlayerIds: new Set(),
    });

    setPlayers(seededPlayers);
    setRounds([r1]);
    setCurrentRoundIndex(0);
    setPhase("playing");
  };

  const persistRebuiltState = useCallback(
    (nextRounds: AmericanoRound[], refreshFromRoundIndex = 0) => {
      const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
      const rebuilt = rebuildStateFromRounds(nextRounds, template);
      const seeds = rosterSeedMap(template);
      const synced = refreshUnscoredSecondHalfRoundsFrom(
        rebuilt.players,
        rebuilt.rounds,
        refreshFromRoundIndex,
        totalRoundsRef.current,
        courtsRef.current,
        seeds
      );
      setRounds(synced);
      setPlayers(rebuilt.players);
    },
    []
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
      persistRebuiltState(nextRounds, idx + 1);
    },
    [phase, persistRebuiltState]
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
      persistRebuiltState(nextRounds, idx);
    },
    [phase, persistRebuiltState]
  );

  const editScore = useCallback(
    (roundIndex: number, matchId: string, scoreA: number, scoreB: number) => {
      const prevRounds = roundsRef.current;
      const nextRounds = prevRounds.map((round, idx) => {
        if (idx !== roundIndex) return round;
        return {
          ...round,
          matches: round.matches.map((match) =>
            match.id === matchId ? { ...match, scoreA, scoreB } : match
          ),
        };
      });
      persistRebuiltState(nextRounds, roundIndex + 1);
    },
    [persistRebuiltState]
  );

  const nextRound = useCallback(() => {
    if (phase !== "playing") return;
    const prevRounds = roundsRef.current;
    const idx = currentRoundIndexRef.current;
    const cur = prevRounds[idx];
    if (!cur) return;

    const allScores = cur.matches.every(
      (m) =>
        typeof m.scoreA === "number" &&
        typeof m.scoreB === "number" &&
        !Number.isNaN(m.scoreA) &&
        !Number.isNaN(m.scoreB) &&
        m.scoreA >= 0 &&
        m.scoreB >= 0
    );
    if (!allScores) return;

    const total = totalRoundsRef.current;
    if (idx + 1 >= total) {
      setPhase("finished");
      return;
    }

    const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
    const rebuilt = rebuildStateFromRounds(prevRounds, template);
    const scoredRounds = filterScoredAmericanoRounds(rebuilt.rounds);
    const { partnerMatrix } = buildMatricesFromScoredRounds(
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
      lastBenchPlayerIds: lastBenchIds,
      scoredRounds,
      seedById: rosterSeedMap(template),
    });

    setPlayers(rebuilt.players);
    setRounds([...rebuilt.rounds, newRound]);
    setCurrentRoundIndex(idx + 1);
  }, [phase]);

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
    if (!options?.organizadorId || participacionSyncedRef.current) return;
    if (players.length === 0) return;

    participacionSyncedRef.current = true;
    const label = options.sessionLabel?.trim() || "Sesión";
    const roster = playersRef.current;
    const allRounds = roundsRef.current;

    void import("../lib/rivieraJugadores/syncParticipaciones")
      .then(({ syncAmericanoParticipaciones }) =>
        syncAmericanoParticipaciones(
          sesionIdRef.current,
          label,
          roster,
          allRounds,
          options.organizadorId!
        )
      )
      .catch((err) =>
        console.error(
          "[riviera-jugadores] sync tras finalizar americano:",
          err
        )
      );
  }, [phase, options?.organizadorId, options?.sessionLabel, players.length]);

  return {
    players,
    rounds,
    currentRoundIndex,
    phase,
    totalRounds: totalRoundsRef.current,
    hydrating,
    remoteSyncReady,
    removePlayer,
    toggleExistingPlayer,
    startTournament,
    commitRoundScores,
    submitScore,
    editScore,
    nextRound,
    ranking,
    rosterForUi,
    currentRound,
  };
}
