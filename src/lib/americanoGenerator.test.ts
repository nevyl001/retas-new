/// <reference types="jest" />

import type { AmericanoPlayer } from "./db/types";
import { generateAmericanoRounds } from "./americanoGenerator";

function makePlayers(total: number): AmericanoPlayer[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `Player ${i + 1}`,
    stats: {
      pointsFor: 0,
      pointsAgainst: 0,
      gamesPlayed: 0,
      roundsOnBench: 0,
    },
  }));
}

describe("generateAmericanoRounds", () => {
  test("with 5 players each round has exactly 1 bench player", () => {
    const rounds = generateAmericanoRounds(makePlayers(5), 4);
    rounds.forEach((round) => {
      expect(round.benchPlayers).toHaveLength(1);
    });
  });

  test("with 8 players no one plays twice in the same round", () => {
    const rounds = generateAmericanoRounds(makePlayers(8), 4, 2);
    rounds.forEach((round) => {
      const playing = new Set<string>();
      round.matches.forEach((match) => {
        [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]].forEach(
          (p) => {
            expect(playing.has(p.id)).toBe(false);
            playing.add(p.id);
          }
        );
      });
    });
  });

  test("throws when called with fewer than 4 players", () => {
    expect(() => generateAmericanoRounds(makePlayers(3), 2)).toThrow();
  });

  test("court numbers stay within configured courts and rotate across rounds", () => {
    const configuredCourts = 3;
    const rounds = generateAmericanoRounds(makePlayers(8), 5, configuredCourts);
    rounds.forEach((r) => {
      const maxCourts = Math.min(configuredCourts, r.matches.length);
      r.matches.forEach((m) => {
        expect(m.court).toBeGreaterThanOrEqual(1);
        expect(m.court).toBeLessThanOrEqual(maxCourts);
      });
    });
    const r1 = rounds[0].matches.map((m) => m.court);
    const r2 = rounds[1].matches.map((m) => m.court);
    expect(r1.length).toBe(r2.length);
    expect(r1).not.toEqual(r2);
  });
});
