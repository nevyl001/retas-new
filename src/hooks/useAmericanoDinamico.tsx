import { useMemo, useState } from "react";
import type { AmericanoPlayer, AmericanoRound } from "../lib/db/types";
import { generateAmericanoRounds } from "../lib/americanoGenerator";
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
    const seededPlayers = players.map((p) => ({
      ...p,
      stats: createEmptyStats(),
    }));
    const generated = generateAmericanoRounds(
      seededPlayers,
      totalRounds,
      safeCourts
    );
    const rebuilt = rebuildStateFromRounds(generated, seededPlayers);
    setPlayers(rebuilt.players);
    setRounds(rebuilt.rounds);
    setCurrentRoundIndex(0);
    setPhase("playing");
  };

  /** Confirma todos los marcadores de la ronda actual en una sola actualización. */
  const commitRoundScores = (
    scores: { matchId: string; scoreA: number; scoreB: number }[]
  ) => {
    if (phase !== "playing") return;
    const map = new Map(scores.map((s) => [s.matchId, s]));
    const nextRounds = rounds.map((round, idx) => {
      if (idx !== currentRoundIndex) return round;
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
    const rebuilt = rebuildStateFromRounds(nextRounds, players);
    setRounds(rebuilt.rounds);
    setPlayers(rebuilt.players);
  };

  const submitScore = (matchId: string, scoreA: number, scoreB: number) => {
    if (phase !== "playing") return;
    const nextRounds = rounds.map((round, idx) => {
      if (idx !== currentRoundIndex) return round;
      return {
        ...round,
        matches: round.matches.map((match) =>
          match.id === matchId ? { ...match, scoreA, scoreB } : match
        ),
      };
    });
    const rebuilt = rebuildStateFromRounds(nextRounds, players);
    setRounds(rebuilt.rounds);
    setPlayers(rebuilt.players);
  };

  const editScore = (
    roundIndex: number,
    matchId: string,
    scoreA: number,
    scoreB: number
  ) => {
    const nextRounds = rounds.map((round, idx) => {
      if (idx !== roundIndex) return round;
      return {
        ...round,
        matches: round.matches.map((match) =>
          match.id === matchId ? { ...match, scoreA, scoreB } : match
        ),
      };
    });
    const rebuilt = rebuildStateFromRounds(nextRounds, players);
    setRounds(rebuilt.rounds);
    setPlayers(rebuilt.players);
  };

  const nextRound = () => {
    if (phase !== "playing") return;
    setCurrentRoundIndex((prev) => {
      const next = prev + 1;
      if (next >= rounds.length) {
        setPhase("finished");
        return prev;
      }
      return next;
    });
  };

  const ranking = useMemo(() => getAmericanoRanking(players), [players]);
  const currentRound = useMemo(
    () => (phase === "playing" ? rounds[currentRoundIndex] ?? null : null),
    [phase, rounds, currentRoundIndex]
  );

  return {
    players,
    rounds,
    currentRoundIndex,
    phase,
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
