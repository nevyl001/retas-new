jest.mock("./database", () => {
  const actual = jest.requireActual("./database") as Record<string, unknown>;
  return {
    ...actual,
    upsertAmericanoLivePublic: jest.fn(async () => true),
    fetchAmericanoLivePublic: jest.fn(async () => null),
  };
});

import {
  mergeAmericanoPrepSnapshots,
  mergeAmericanoScoreRevisions,
  pickNewerAmericanoSnapshot,
  resetAmericanoDinamicoRemote,
  snapshotSavedAtMs,
} from "./americanoDinamicoSync";
import type { AmericanoDinamicoSnapshotV1 } from "./americanoDinamicoStorage";
import { loadAmericanoDinamicoSnapshot } from "./americanoDinamicoStorage";
import { upsertAmericanoLivePublic } from "./database";

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

  it("resetAmericanoDinamicoRemote conserva el roster y limpia rondas", async () => {
    (upsertAmericanoLivePublic as jest.Mock).mockResolvedValue(true);
    const tid = "americano-reset-roster-test";
    const roster = [
      { id: "p1", name: "AronMer" },
      { id: "p2", name: "AustinT" },
      { id: "p3", name: "Bortoluci" },
      { id: "p4", name: "Chaparro" },
      { id: "p5", name: "Duran" },
      { id: "p6", name: "Ferrito" },
      { id: "p7", name: "Ferro" },
      { id: "p8", name: "Devyl" },
    ];

    await resetAmericanoDinamicoRemote(tid, {
      roster,
      plannedCourts: 2,
    });

    expect(upsertAmericanoLivePublic).toHaveBeenCalled();
    const remoteSnap = (upsertAmericanoLivePublic as jest.Mock).mock
      .calls[0][1] as AmericanoDinamicoSnapshotV1;
    expect(remoteSnap.tournamentPhase).toBe("registration");
    expect(remoteSnap.rounds).toEqual([]);
    expect(remoteSnap.roster?.map((p) => p.name)).toEqual(
      roster.map((p) => p.name)
    );
    expect(remoteSnap.ranking?.map((p) => p.name)).toEqual(
      roster.map((p) => p.name)
    );

    const saved = loadAmericanoDinamicoSnapshot(tid);
    expect(saved?.roster?.map((p) => p.name)).toEqual(
      roster.map((p) => p.name)
    );
    expect(saved?.plannedCourts).toBe(2);

    localStorage.removeItem(`americano_dinamico_snapshot_v1_${tid}`);
  });
});
