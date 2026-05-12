import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { AmericanoPlayer, AmericanoRound } from "../lib/db/types";
import {
  buildMatricesFromScoredRounds,
  generateAmericanoRound,
} from "../lib/americanoGenerator";
import {
  applyAmericanoResult,
  getAmericanoRanking,
} from "../lib/americanoStandings";

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

export function useAmericanoDinamico() {
  const [players, setPlayers] = useState<AmericanoPlayer[]>([]);
  const [rounds, setRounds] = useState<AmericanoRound[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [phase, setPhase] = useState<AmericanoPhase>("registration");

  const baseRosterRef = useRef<AmericanoPlayer[]>([]);
  const totalRoundsRef = useRef(0);
  const courtsRef = useRef(1);
  const roundsRef = useRef(rounds);
  const currentRoundIndexRef = useRef(currentRoundIndex);
  const playersRef = useRef(players);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);
  useEffect(() => {
    currentRoundIndexRef.current = currentRoundIndex;
  }, [currentRoundIndex]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const addPlayer = (name: string) => {
    if (phase !== "registration") return;
    const clean = name.trim();
    if (!clean) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `americano-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPlayers((prev) => [...prev, { id, name: clean, stats: createEmptyStats() }]);
  };

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
      const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
      const rebuilt = rebuildStateFromRounds(nextRounds, template);
      setRounds(rebuilt.rounds);
      setPlayers(rebuilt.players);
    },
    [phase]
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
      const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
      const rebuilt = rebuildStateFromRounds(nextRounds, template);
      setRounds(rebuilt.rounds);
      setPlayers(rebuilt.players);
    },
    [phase]
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
      const template = rosterTemplateFromRef(baseRosterRef, playersRef.current);
      const rebuilt = rebuildStateFromRounds(nextRounds, template);
      setRounds(rebuilt.rounds);
      setPlayers(rebuilt.players);
    },
    []
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
    const { partnerMatrix } = buildMatricesFromScoredRounds(
      rebuilt.players,
      rebuilt.rounds
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
    });

    setPlayers(rebuilt.players);
    setRounds([...rebuilt.rounds, newRound]);
    setCurrentRoundIndex(idx + 1);
  }, [phase]);

  const ranking = useMemo(() => {
    if (phase === "registration") return [];
    const template = rosterTemplateFromRef(baseRosterRef, players);
    if (template.length === 0) return getAmericanoRanking(players);
    const slice =
      phase === "finished"
        ? rounds
        : rounds.slice(0, currentRoundIndex);
    const { players: rp } = rebuildStateFromRounds(slice, template);
    return getAmericanoRanking(rp);
  }, [phase, rounds, currentRoundIndex, players]);

  const currentRound = useMemo(
    () => (phase === "playing" ? rounds[currentRoundIndex] ?? null : null),
    [phase, rounds, currentRoundIndex]
  );

  return {
    players,
    rounds,
    currentRoundIndex,
    phase,
    totalRounds: totalRoundsRef.current,
    addPlayer,
    removePlayer,
    toggleExistingPlayer,
    startTournament,
    commitRoundScores,
    submitScore,
    editScore,
    nextRound,
    ranking,
    currentRound,
  };
}
