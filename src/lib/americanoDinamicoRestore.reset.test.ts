import { applyAmericanoSnapshotToState } from "./americanoDinamicoRestore";
import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";
import type { AmericanoPlayer } from "./db/types";

describe("applyAmericanoSnapshotToState — post-reinicio", () => {
  it("restaura jugadores desde roster cuando ranking está vacío", () => {
    const players: AmericanoPlayer[] = [];
    const rounds: unknown[] = [{ keep: true }];
    let phase = "playing";
    let roundIndex = 3;
    const baseRosterRef = { current: [] as AmericanoPlayer[] };
    const totalRoundsRef = { current: 8 };
    const courtsRef = { current: 2 };

    const snap: AmericanoDinamicoSnapshotV1 = {
      version: 1,
      savedAt: "2026-10-28T00:00:00Z",
      tournamentPhase: "registration",
      plannedCourts: 2,
      roster: [
        { id: "a", name: "AronMer" },
        { id: "b", name: "Devyl" },
      ],
      ranking: [],
      rounds: [],
    };

    const ok = applyAmericanoSnapshotToState(
      snap,
      {
        setPlayers: (next) => {
          players.splice(0, players.length, ...next);
        },
        setRounds: (next) => {
          rounds.splice(0, rounds.length, ...next);
        },
        setCurrentRoundIndex: (i) => {
          roundIndex = i;
        },
        setPhase: (p) => {
          phase = p;
        },
      },
      { baseRosterRef, totalRoundsRef, courtsRef }
    );

    expect(ok).toBe(true);
    expect(phase).toBe("registration");
    expect(roundIndex).toBe(0);
    expect(rounds).toEqual([]);
    expect(players.map((p) => p.name)).toEqual(["AronMer", "Devyl"]);
    expect(courtsRef.current).toBe(2);
  });
});
