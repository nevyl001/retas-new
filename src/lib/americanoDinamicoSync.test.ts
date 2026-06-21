import {
  pickNewerAmericanoSnapshot,
  snapshotSavedAtMs,
} from "./americanoDinamicoSync";
import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";

function snap(savedAt: string): AmericanoDinamicoSnapshotV1 {
  return {
    version: 1,
    savedAt,
    ranking: [{ id: "1", name: "A", stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 } }],
    rounds: [],
  };
}

describe("americanoDinamicoSync", () => {
  it("pickNewerAmericanoSnapshot elige el más reciente", () => {
    const local = snap("2026-01-01T10:00:00Z");
    const remote = snap("2026-01-02T10:00:00Z");
    expect(pickNewerAmericanoSnapshot(local, remote)).toBe(remote);
    expect(pickNewerAmericanoSnapshot(remote, local)).toBe(remote);
  });

  it("snapshotSavedAtMs devuelve 0 si falta fecha", () => {
    expect(snapshotSavedAtMs(null)).toBe(0);
  });
});
