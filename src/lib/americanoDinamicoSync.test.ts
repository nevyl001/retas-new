import {
  mergeAmericanoPrepSnapshots,
  mergeAmericanoScoreRevisions,
  pickNewerAmericanoSnapshot,
  snapshotSavedAtMs,
} from "./americanoDinamicoSync";
import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";

function snap(
  savedAt: string,
  extra?: Partial<AmericanoDinamicoSnapshotV1>
): AmericanoDinamicoSnapshotV1 {
  return {
    version: 1,
    savedAt,
    tournamentPhase: "registration",
    ranking: [{ id: "1", name: "A", stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 } }],
    rounds: [],
    ...extra,
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

  it("mergeAmericanoPrepSnapshots conserva rondas/canchas del snapshot más viejo", () => {
    const local = snap("2026-01-02T10:00:00Z", {
      totalRounds: 5,
      plannedCourts: 3,
    });
    const remote = snap("2026-01-03T10:00:00Z");
    const merged = mergeAmericanoPrepSnapshots(local, remote);
    expect(merged?.totalRounds).toBe(5);
    expect(merged?.plannedCourts).toBe(3);
    expect(merged?.savedAt).toBe(remote.savedAt);
  });

  it("conserva Editado local si el remoto trae el mismo marcador sin la clave", () => {
    const player = snap("x").ranking[0];
    const pair = [player, player] as [
      typeof player,
      typeof player
    ];
    const match = {
      id: "m1",
      court: 1,
      scoreA: 3,
      scoreB: 6,
      teamA: pair,
      teamB: pair,
    };
    const local = snap("2026-01-01T10:00:00Z", {
      rounds: [
        {
          roundNumber: 1,
          phase: 1,
          benchPlayers: [],
          matches: [
            {
              ...match,
              scoreRevision: {
                previousScoreA: 6,
                previousScoreB: 3,
                editedAt: "2026-01-01T09:00:00Z",
              },
            },
          ],
        },
      ],
    });
    const remote = snap("2026-01-02T10:00:00Z", {
      rounds: [
        {
          roundNumber: 1,
          phase: 1,
          benchPlayers: [],
          matches: [match],
        },
      ],
    });
    const merged = mergeAmericanoScoreRevisions(remote, local);
    expect(merged.rounds[0].matches[0].scoreRevision?.previousScoreA).toBe(6);
    const conflict = mergeAmericanoScoreRevisions(
      snap("2026-01-02T10:00:00Z", {
        rounds: [
          {
            roundNumber: 1,
            phase: 1,
            benchPlayers: [],
            matches: [{ ...match, scoreA: 1, scoreB: 1 }],
          },
        ],
      }),
      local
    );
    expect(conflict.rounds[0].matches[0].scoreRevision).toBeUndefined();
  });
});
